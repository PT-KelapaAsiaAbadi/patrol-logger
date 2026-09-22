/**
 * Patrol logger: guard-facing web app for recording checkpoint patrols.
 *
 * Flow: enroll this phone once -> log in with a PIN each shift -> scan
 * checkpoint QR codes. Each scan sends the QR text, GPS fix and a photo to
 * a Google Apps Script backend. Scans made offline are queued in
 * localStorage and uploaded when the connection returns.
 */

/* ============ Configuration ============ */

/** Apps Script web app endpoint. The app shows a setup screen if this is not an http(s) URL. */
const API_URL = "https://script.google.com/macros/s/AKfycbzZ-Lhb8RiaZgnjW2XzOMZunRGhcQkPiL1dApToL0gZteKdME9aa0TQSkyjSPNg1BgGdA/exec";

/** Only QR codes starting with this prefix are treated as checkpoints. */
const QR_PREFIX = "GP1|";

/** GPS measure of accuracy. Submit immediately when GPS is this good */
const GOOD_ACCURACY_M = 30;

/** How long to wait to get improved GPS location (closer to target checkpoint) */
const GPS_WAIT_MS = 12000;

/** Maximum offline scans kept; the oldest are dropped beyond this. */
const MAX_QUEUE = 30;

/** Guard-readable explanations for the flag codes the server returns. */
const FLAG_TEXT = {
	OUT_OF_RANGE: "You appear to be too far from this checkpoint. Your supervisor will review this scan.",
	LOW_ACCURACY: "GPS signal was weak.",
	IMPOSSIBLE_TRAVEL: "The time since your last checkpoint looks too short for the distance.",
	DUPLICATE: "You already scanned this checkpoint a few minutes ago.",
	LATE_SYNC: "This scan was uploaded late because the phone was offline.",
	NO_GEOFENCE: "This checkpoint does not have a location set up yet.",
	CALIBRATED: "Checkpoint location was saved from your position.",
	NO_PHOTO: "No photo was saved with this scan.",
	PHOTO_SAVE_FAILED: "The photo could not be saved.",
	PHONE_CLOCK_AHEAD: "This phone's clock is wrong. Set it to automatic time.",
};

/* ============ Storage ============ */

/**
 * JSON wrapper around localStorage. Keys are prefixed with "gp_".
 * Keys used: device, session, history, queue.
 */
const store = {
	/** Returns the parsed value, or null if missing or unreadable. */
	get(key) {
		try {
			return JSON.parse(localStorage.getItem("gp_" + key));
		} catch (e) {
			return null;
		}
	},
	/** Saves a value as JSON. Throws if storage is full. */
	set(key, value) {
		localStorage.setItem("gp_" + key, JSON.stringify(value));
	},
	remove(key) {
		localStorage.removeItem("gp_" + key);
	},
};

/** Shorthand for document.getElementById. */
const byId = (id) => document.getElementById(id);

/**
 * Shows the screen with the given id and hides every other ".screen".
 * @param {string} id - Section id, e.g. "home" or "scan".
 */
function showScreen(id) {
	document
		.querySelectorAll(".screen")
		.forEach((section) => section.classList.toggle("on", section.id === id));
	window.scrollTo(0, 0);
}

/* ============ API ============ */

/**
 * Thrown when the server can't be reached or returns an unusable response.
 * It has no body on purpose: it exists so callers can tell connection
 * problems (queue and retry) apart from bugs (rethrow) with `instanceof`.
 */
class NetworkError extends Error {}

/**
 * Sends a request to the backend and returns its JSON reply.
 * 
 * @param {object} body - Request payload; `action` selects the server handler.
 * @returns {Promise<object>} Server reply; check `ok` before using it.
 * @throws {NetworkError} If offline, on a non-2xx status, or if the reply isn't JSON.
 */
async function postToApi(body) {
	let res;
	try {
		// text/plain avoids a CORS preflight, which Apps Script does not answer.
		res = await fetch(API_URL, {
			method: "POST",
			body: JSON.stringify(body),
			redirect: "follow",
		});
	} catch (e) {
		throw new NetworkError("offline");
	}

	if (!res.ok) throw new NetworkError("HTTP " + res.status);

	try {
		return await res.json();
	} catch (e) {
		throw new NetworkError("bad response");
	}
}

/**
 * Creates a random ID so the server can ignore duplicate uploads of the same scan.
 * Falls back to 32 random hex characters on browsers without crypto.randomUUID.
 * @returns {string}
 */
function newScanId() {
	if (crypto.randomUUID) return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ============ Routing ============ */

/**
 * Chooses the screen from saved state: config (no API URL), enroll (no
 * device), login (no session or session expired), otherwise home.
 */
function routeToScreen() {
	if (!API_URL || API_URL.indexOf("http") !== 0) return showScreen("screen-setup-required");

	const device = store.get("device");
	if (!device) return showScreen("screen-enroll");

	const session = store.get("session");
	if (!session || new Date(session.expires) < new Date()) {
		byId("login-greeting").textContent = "Hi, " + device.name;
		byId("login-pin").value = "";
		return showScreen("screen-login");
	}

	renderHomeScreen();
	showScreen("screen-home");
}

/* ============ Enrollment ============ */

/**
 * Links this phone to a guard using a one-time code from their supervisor.
 * Checks the form, then saves the device token the server returns.
 * Requires internet.
 */
byId("enroll-submit").onclick = async () => {
	const id = byId("enroll-guard-id").value.trim();
	const code = byId("enroll-code").value.trim();
	const pin = byId("enroll-pin").value;
	const pin2 = byId("enroll-pin-confirm").value;

	byId("enroll-error").textContent = "";

	if (!id || !code) {
		return (byId("enroll-error").textContent = "Enter your guard ID and enrollment code.");
	}

	// TODO: Review: are we using REGEX?
	if (!/^\d{4,8}$/.test(pin)) {
		return (byId("enroll-error").textContent = "PIN must be 4 to 8 digits.");
	}
	if (pin !== pin2) {
		return (byId("enroll-error").textContent = "The two PINs do not match.");
	}

	byId("enroll-submit").disabled = true;

	try {
		const reply = await postToApi({
			action: "enroll",
			guard_id: id,
			code,
			pin,
		});

		if (!reply.ok) {
			byId("enroll-error").textContent = reply.error;
			return;
		}

		store.set("device", {
			guard_id: reply.guard_id,
			name: reply.name,
			device_token: reply.device_token,
		});
		store.remove("session");
		store.set("history", []);
		routeToScreen();
	} catch (e) {
		byId("enroll-error").textContent =
			"No internet connection. Connect and try again.";
	} finally {
		byId("enroll-submit").disabled = false;
	}
};

/* ============ Shift login ============ */

/**
 * Starts a shift: sends the PIN and device token, then saves the session
 * the server returns. Clears the history list shown for the previous shift.
 * If the server says the device was revoked, removes the enrollment and
 * returns to the enroll screen.
 */
byId("login-submit").onclick = async () => {
	const device = store.get("device");
	byId("login-error").textContent = "";
	byId("login-submit").disabled = true;

	try {
		const reply = await postToApi({
			action: "login",
			guard_id: device.guard_id,
			device_token: device.device_token,
			pin: byId("login-pin").value,
		});

		if (!reply.ok) {
			byId("login-error").textContent = reply.error;
			if (reply.reenroll) {
				store.remove("device");
				setTimeout(routeToScreen, 2500); // leave time to read the error
			}
			return;
		}

		store.set("session", {
			token: reply.session_token,
			expires: reply.expires,
			role: reply.role,
		});
		store.set("history", []);
		routeToScreen();
	} catch (e) {
		byId("login-error").textContent =
			"No internet connection. You need internet to start a shift.";
	} finally {
		byId("login-submit").disabled = false;
	}
};

/** After confirmation, removes this phone's enrollment so another guard can set it up. */
byId("login-reset-device").onclick = () => {
	if (
		confirm(
			"Remove this phone setup? You will need a new enrollment code from your supervisor.",
		)
	) {
		store.remove("device");
		store.remove("session");
		routeToScreen();
	}
};

/* ============ Home ============ */

/**
 * Updates the home screen: guard name, session end time, number of scans
 * waiting to upload, online status, and this shift's scans (newest first).
 */
function renderHomeScreen() {
	const device = store.get("device");
	const session = store.get("session");

	byId("home-guard-name").textContent = device.name;
	byId("home-shift-expiry").textContent =
		"Shift login valid until " +
		new Date(session.expires).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

	const queue = store.get("queue") || [];
	byId("home-queue-count").textContent = queue.length;
	byId("home-network-status").textContent = navigator.onLine ? "Online" : "Offline";

	const entries = store.get("history") || [];
	byId("home-history-empty").style.display = entries.length ? "none" : "block";
	byId("home-history-list").innerHTML = "";

	entries.slice()
		.reverse()
		.forEach((entry) => {
			const li = document.createElement("li");

			const name = document.createElement("div");
			name.textContent = entry.name;

			const when = document.createElement("div");
			when.className = "when";
			when.textContent = new Date(entry.time).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});

			const tag = document.createElement("div");
			tag.className = "tag " + entry.kind;
			tag.textContent = entry.label;

			li.append(name, when, tag);
			byId("home-history-list").appendChild(li);
		});
}

/**
 * Adds a scan to this shift's history, keeping only the latest 40.
 * @param {{name: string, time: string, kind: "ok"|"warn"|"bad", label: string}} entry
 */
function addHistoryEntry(entry) {
	const entries = store.get("history") || [];
	entries.push(entry);
	store.set("history", entries.slice(-40));
}

byId("home-scan-button").onclick = openScanner;

/** Ends the shift. Warns first if scans are still waiting to upload. */
byId("home-end-shift").onclick = () => {
	const queue = store.get("queue") || [];
	const message = queue.length
		? queue.length +
			" scan(s) have not uploaded yet. Connect to the internet first, or they may be lost. End shift anyway?"
		: "End your shift on this phone?";

	if (confirm(message)) {
		store.remove("session");
		routeToScreen();
	}
};

/* ============ Scanner ============ */

let cameraStream = null; // active camera MediaStream
let gpsWatchId = null; // geolocation watch handle
let bestGpsFix = null; // most accurate GPS fix this scan: {lat, lng, accuracy}
let isScanning = false; // true while the scan loop should keep running
let barcodeDetector = null; // native BarcodeDetector, if supported; otherwise jsQR is used
let scanFrameTimer = null; // timeout for the next scan loop tick

/** Reusable offscreen canvas for jsQR frame decoding. */
const decodeCanvas = document.createElement("canvas");

/**
 * Opens the scanner: starts GPS, turns on the rear camera, and picks a QR
 * decoder (native BarcodeDetector when available, otherwise jsQR).
 * Shows an error result if the camera is blocked.
 */
async function openScanner() {
	showScreen("screen-scanner");
	byId("scanner-message").textContent = "Point the camera at the checkpoint code.";
	byId("scanner-gps-status").textContent = "Getting location…";

	bestGpsFix = null;
	isScanning = true;

	startGpsWatch();
	try {
		cameraStream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: { ideal: "environment" },
				width: { ideal: 1280 },
				height: { ideal: 720 },
			},
			audio: false,
		});
	} catch (e) {
		closeScanner();
		return showResultScreen(
			"bad",
			"Camera blocked",
			"Allow camera access for this page in your browser settings, then try again.",
		);
	}

	const video = byId("scanner-video");
	video.srcObject = cameraStream;
	await video.play().catch(() => {});

	if ("BarcodeDetector" in window) {
		try {
			const formats = await BarcodeDetector.getSupportedFormats();
			if (formats.includes("qr_code")) {
				barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
			}
		} catch (e) {
			barcodeDetector = null;
		}
	}

	scanNextFrame();
}

/**
 * Checks one video frame for a QR code, then runs again every 180 ms until a
 * checkpoint code is found or scanning stops. Codes without QR_PREFIX are
 * ignored with a message.
 */
async function scanNextFrame() {
	if (!isScanning) return;

	const video = byId("scanner-video");
	let qrText = null;

	if (video.readyState >= 2) {
		try {
			if (barcodeDetector) {
				const codes = await barcodeDetector.detect(video);
				if (codes.length) qrText = codes[0].rawValue;
			} else if (window.jsQR) {
				// Shrink the frame to 640px wide so jsQR stays fast.
				const width = 640;
				const height = Math.round((640 * video.videoHeight) / video.videoWidth) || 480;
				decodeCanvas.width = width;
				decodeCanvas.height = height;

				const ctx = decodeCanvas.getContext("2d", { willReadFrequently: true });
				ctx.drawImage(video, 0, 0, width, height);
				const decoded = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, {
					inversionAttempts: "dontInvert",
				});
				if (decoded) qrText = decoded.data;
			}
		} catch (e) {
			/* keep trying */
		}
	}

	if (qrText && qrText.indexOf(QR_PREFIX) === 0) return handleCheckpointCode(qrText);
	
	if (qrText) {
		byId("scanner-message").textContent = "That is not a checkpoint code.";
	} 

	scanFrameTimer = setTimeout(scanNextFrame, 180);
}

/**
 * Watches GPS position and keeps the most accurate fix in `bestGpsFix`.
 * Shows the current accuracy, or advice if location is blocked or unavailable.
 */
function startGpsWatch() {
	if (!("geolocation" in navigator)) {
		byId("scanner-gps-status").textContent = "This phone has no GPS support.";
		return;
	}

	gpsWatchId = navigator.geolocation.watchPosition(
		(pos) => {
			const coords = pos.coords;
			if (!bestGpsFix || coords.accuracy <= bestGpsFix.accuracy) {
				bestGpsFix = {
					lat: coords.latitude,
					lng: coords.longitude,
					accuracy: coords.accuracy,
				};
			}
			byId("scanner-gps-status").textContent = "Location found (within " + Math.round(bestGpsFix.accuracy) + " m)";
		},
		(err) => {
			byId("scanner-gps-status").textContent =
				err.code === 1
					? "Location blocked. Allow location for this page in your browser settings."
					: "Still looking for GPS. Move away from walls if you can.";
		},
		{ enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
	);
}

/** Stops the scan loop and turns off the camera and GPS watch. Safe to call more than once. */
function closeScanner() {
	isScanning = false;
	clearTimeout(scanFrameTimer);

	if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
	cameraStream = null;

	if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
	gpsWatchId = null;
}

byId("scanner-cancel").onclick = () => {
	closeScanner();
	routeToScreen();
};

// Turn the camera and GPS off when the app goes to the background.
document.addEventListener("visibilitychange", () => {
	if (document.hidden && isScanning) {
		closeScanner();
		routeToScreen();
	}
});

/**
 * Takes a photo of the current camera frame as evidence.
 * @returns {string} JPEG data URL, 480px wide, quality 0.6.
 */
function captureEvidencePhoto() {
	const video = byId("scanner-video");
	const width = 480;
	const height = Math.round((480 * video.videoHeight) / video.videoWidth) || 360;

	const photoCanvas = document.createElement("canvas");
	photoCanvas.width = width;
	photoCanvas.height = height;
	photoCanvas.getContext("2d").drawImage(video, 0, 0, width, height);
	return photoCanvas.toDataURL("image/jpeg", 0.6);
}

/**
 * Handles a checkpoint code: takes a photo straight away, waits up to
 * GPS_WAIT_MS for a GPS fix within GOOD_ACCURACY_M, then submits the scan.
 * If there is no GPS fix at all, the scan is not saved.
 * @param {string} qrText - Raw QR text, starting with QR_PREFIX.
 */
async function handleCheckpointCode(qrText) {
	isScanning = false;
	clearTimeout(scanFrameTimer);
	byId("scanner-message").textContent = "Code read. Checking location…";

	const evidence = captureEvidencePhoto();
	const takenAt = new Date().toISOString();

	const start = Date.now();
	while (
		(!bestGpsFix || bestGpsFix.accuracy > GOOD_ACCURACY_M) &&
		Date.now() - start < GPS_WAIT_MS
	) {
		await new Promise((resolve) => setTimeout(resolve, 400));
	}

	const gpsFix = bestGpsFix;
	closeScanner();

	if (!gpsFix) {
		return showResultScreen(
			"bad",
			"No location",
			"The scan was not saved because GPS is off or blocked. Turn on location and scan again.",
		);
	}

	const device = store.get("device");
	const session = store.get("session");

	const payload = {
		action: "scan",
		guard_id: device.guard_id,
		device_token: device.device_token,
		session_token: session.token,
		qr: qrText,
		lat: gpsFix.lat,
		lng: gpsFix.lng,
		accuracy: gpsFix.accuracy,
		client_time: takenAt,
		scan_id: newScanId(),
		evidence,
	};

	await uploadScan(payload, true);
}

/* ============ Upload + offline queue ============ */

/**
 * Uploads a scan. On a network error, a new scan is queued for later
 * (and the guard is told). A retry from the queue simply fails and is tried again later.
 * @param {object} payload - Scan payload built by handleCheckpointCode.
 * @param {boolean} interactive - true for a new scan (update the UI), false for a queue retry.
 * @returns {Promise<boolean>} true if the server received it (even if it rejected the scan).
 */
async function uploadScan(payload, interactive) {
	try {
		const reply = await postToApi(payload);
		handleScanReply(reply, payload, interactive);
		return true;
	} catch (e) {
		if (!(e instanceof NetworkError)) throw e;

		if (interactive) {
			queueScanForLater(payload);
			addHistoryEntry({
				name: "Checkpoint (not uploaded yet)",
				time: payload.client_time,
				kind: "warn",
				label: "Saved on phone",
			});
			showResultScreen(
				"warn",
				"Saved on this phone",
				"No internet right now. The scan will upload automatically when you are back online. The office will see it was uploaded late.",
			);
		}

		return false;
	}
}

/**
 * Handles the server's reply to a scan: follows relogin/reenroll requests,
 * adds a history entry, and shows the result screen for new scans.
 * @param {object} reply - Server reply.
 * @param {object} payload - The scan that was sent.
 * @param {boolean} interactive - Whether to show the result screen.
 */
function handleScanReply(reply, payload, interactive) {
	if (reply.relogin) store.remove("session");
	if (reply.reenroll) {
		store.remove("device");
		store.remove("session");
	}

	if (!reply.ok) {
		addHistoryEntry({
			name: "Scan rejected",
			time: payload.client_time,
			kind: "bad",
			label: reply.error,
		});
		if (interactive) showResultScreen("bad", "Not recorded", reply.error);
		return;
	}

	// Flags arrive as a space-separated string, e.g. "LOW_ACCURACY LATE_SYNC".
	const flags = (reply.flags || "").split(" ").filter(Boolean);
	const warnings = flags.map((f) => FLAG_TEXT[f] || f);

	addHistoryEntry({
		name: reply.cp_name,
		time: reply.server_time || payload.client_time,
		kind: warnings.length ? "warn" : "ok",
		label: warnings.length ? "Recorded, needs review" : "Recorded",
	});

	if (interactive) {
		showResultScreen(
			warnings.length ? "warn" : "ok",
			reply.cp_name,
			null,
			warnings,
			new Date(reply.server_time || payload.client_time),
		);
	}
}

/**
 * Adds a scan to the offline queue, dropping the oldest beyond MAX_QUEUE.
 * If storage is full, removes photos from queued scans so the scan data still fits.
 * @param {object} payload
 */
function queueScanForLater(payload) {
	const queue = store.get("queue") || [];
	queue.push(payload);
	while (queue.length > MAX_QUEUE) queue.shift();

	try {
		store.set("queue", queue);
	} catch (e) {
		// Storage full: keep the scan, drop its photo.
		payload.evidence = null;
		store.set("queue", queue.map((scan) => Object.assign({}, scan, { evidence: null })));
	}
}

/** Prevents two uploadQueuedScans runs from sending the same scans at once. */
let isUploadingQueue = false;

/**
 * Uploads queued scans oldest first, and stops at the first network failure.
 * Each scan is removed from the queue only after the server receives it.
 */
async function uploadQueuedScans() {
	if (isUploadingQueue) return;

	isUploadingQueue = true;
	try {
		let queue = store.get("queue") || [];
		while (queue.length) {
			const sent = await uploadScan(queue[0], false);
			if (!sent) break;
			queue = (store.get("queue") || []).slice(1);
			store.set("queue", queue);
		}
	} finally {
		isUploadingQueue = false;
		if (byId("screen-home").classList.contains("on")) renderHomeScreen();
	}
}

/* ============ Result ============ */

/**
 * Shows the result screen after a scan.
 * @param {"ok"|"warn"|"bad"} kind - Sets the status label and color.
 * @param {string} title - Main heading, usually the checkpoint name.
 * @param {string|null} [message] - Explanation; shown instead of the time.
 * @param {string[]} [warnings] - Flag explanations to list. When kind is "warn"
 *   and this is omitted, the status reads "Waiting to upload" (offline scan).
 * @param {Date} [time] - When the scan was recorded.
 */
function showResultScreen(kind, title, message, warnings, time) {
	const mark = {
		ok: "Recorded",
		warn: "Recorded, needs review",
		bad: "Not recorded",
	}[kind];

	byId("result-status").className = "result-mark " + kind;
	byId("result-status").textContent = kind === "warn" && !warnings ? "Waiting to upload" : mark;
	byId("result-checkpoint-name").textContent = title;
	byId("result-detail").textContent = message || (time ? time.toLocaleString() : "");

	byId("result-warning-list").innerHTML = "";
	(warnings || []).forEach((w) => {
		const li = document.createElement("li");
		li.textContent = w;
		byId("result-warning-list").appendChild(li);
	});

	showScreen("screen-result");
}

byId("result-done").onclick = routeToScreen;

/* ============ Start ============ */

// Upload queued scans as soon as the connection returns, and keep the online status current.
window.addEventListener("online", () => {
	uploadQueuedScans();
	if (byId("screen-home").classList.contains("on")) renderHomeScreen();
});

window.addEventListener("offline", () => {
	if (byId("screen-home").classList.contains("on")) renderHomeScreen();
});

// Also retry every minute, in case the "online" event never fires.
setInterval(uploadQueuedScans, 60000);

routeToScreen();
if (store.get("device")) uploadQueuedScans();
