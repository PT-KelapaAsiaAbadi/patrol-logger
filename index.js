/**
 * TODO: Review and refactor.
 */

/**
 * TODO: Update documentation.
 */
const API_URL = "https://script.google.com/macros/s/AKfycbzZ-Lhb8RiaZgnjW2XzOMZunRGhcQkPiL1dApToL0gZteKdME9aa0TQSkyjSPNg1BgGdA/exec";
const QR_PREFIX = "GP1|";
const GOOD_ACCURACY_M = 30; // submit immediately when GPS is this good
const GPS_WAIT_MS = 12000; // otherwise wait this long for a better fix
const MAX_QUEUE = 30;

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
 * TODO: Add documentation.
 */
const store = {
	get(k) {
		try {
			return JSON.parse(localStorage.getItem("gp_" + k));
		} catch (e) {
			return null;
		}
	},
	set(k, v) {
		localStorage.setItem("gp_" + k, JSON.stringify(v));
	},
	del(k) {
		localStorage.removeItem("gp_" + k);
	},
};
const $ = (id) => document.getElementById(id);

/**
 * TODO: Update docs.
 * @param {*} id 
 */
function show(id) {
	document
	.querySelectorAll(".screen")
	.forEach((s) => s.classList.toggle("on", s.id === id));
	window.scrollTo(0, 0);
}

/* ============ API ============ */

/**
 * TODO: Update docs.
 * FIX: Why is it empty?
 */
class NetworkError extends Error {}

/**
 * TODO: Update docs.
 * @param {} body 
 * @returns 
 */
async function api(body) {
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
 * TODO: Update docs.
 * @returns 
 */
function uuid() {
	if (crypto.randomUUID) return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/* ============ Routing ============ */

/**
 * TODO: Update docs.
 * @returns 
 */
function route() {
	if (!API_URL || API_URL.indexOf("http") !== 0) return show("config");

	const device = store.get("device");
	if (!device) return show("enroll");

	const session = store.get("session");
	if (!session || new Date(session.expires) < new Date()) {
		$("l-hello").textContent = "Hi, " + device.name;
		$("l-pin").value = "";
		return show("login");
	}

	renderHome();
	show("home");
}

/* ============ Enrollment ============ */

/**
 * TODO: Update docs.
 */

$("e-btn").onclick = async () => {
	const id = $("e-id").value.trim(),
		code = $("e-code").value.trim();

	const pin = $("e-pin").value,
		pin2 = $("e-pin2").value;

	$("e-err").textContent = "";
	if (!id || !code)
		return ($("e-err").textContent =
			"Enter your guard ID and enrollment code.");

	if (!/^\d{4,8}$/.test(pin))
		return ($("e-err").textContent = "PIN must be 4 to 8 digits.");

	if (pin !== pin2) {
		return ($("e-err").textContent = "The two PINs do not match.");
	}

	$("e-btn").disabled = true;
	try {
		const r = await api({
			action: "enroll",
			guard_id: id,
			code,
			pin,
		});
		if (!r.ok) {
			$("e-err").textContent = r.error;
			return;
		}
		store.set("device", {
			guard_id: r.guard_id,
			name: r.name,
			device_token: r.device_token,
		});
		store.del("session");
		store.set("history", []);
		route();
	} catch (e) {
		$("e-err").textContent =
			"No internet connection. Connect and try again.";
	} finally {
		$("e-btn").disabled = false;
	}
};

/* ============ Shift login ============ */

/**
 * TODO: Update docs.
 */

$("l-btn").onclick = async () => {
	const device = store.get("device");
	$("l-err").textContent = "";
	$("l-btn").disabled = true;

	try {
		const r = await api({
			action: "login",
			guard_id: device.guard_id,
			device_token: device.device_token,
			pin: $("l-pin").value,
		});

		if (!r.ok) {
			$("l-err").textContent = r.error;
			if (r.reenroll) {
				store.del("device");
				setTimeout(route, 2500);
			}
			return;
		}

		store.set("session", {
			token: r.session_token,
			expires: r.expires,
			role: r.role,
		});

		store.set("history", []);
		route();
	} catch (e) {
		$("l-err").textContent =
			"No internet connection. You need internet to start a shift.";
	} finally {
		$("l-btn").disabled = false;
	}
};

$("l-reset").onclick = () => {
	if (
		confirm(
			"Remove this phone setup? You will need a new enrollment code from your supervisor.",
		)
	) {
		store.del("device");
		store.del("session");
		route();
	}
};

/* ============ Home ============ */

/**
 * TODO: Update docs.
 */
function renderHome() {
	const device = store.get("device"),
		session = store.get("session");
	$("h-name").textContent = device.name;
	$("h-shift").textContent =
		"Shift login valid until " +
		new Date(session.expires).toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});

	const queue = store.get("queue") || [];
	$("h-queue").textContent = queue.length;
	$("h-net").textContent = navigator.onLine ? "Online" : "Offline";

	const hist = store.get("history") || [];
	$("h-empty").style.display = hist.length ? "none" : "block";
	$("h-history").innerHTML = "";
	hist.slice()
		.reverse()
		.forEach((h) => {
			const li = document.createElement("li");
			const name = document.createElement("div");
			name.textContent = h.name;

			const when = document.createElement("div");
			when.className = "when";
			when.textContent = new Date(h.time).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit",
			});

			const tag = document.createElement("div");
			tag.className = "tag " + h.kind;
			tag.textContent = h.label;
			li.append(name, when, tag);
			$("h-history").appendChild(li);
		});
}

/**
 * TODO: Update docs.
 * @param {*} entry 
 */
function addHistory(entry) {
	const hist = store.get("history") || [];
	hist.push(entry);
	store.set("history", hist.slice(-40));
}

$("h-scan").onclick = startScan;
$("h-end").onclick = () => {
	const q = store.get("queue") || [];
	const msg = q.length
		? q.length +
			" scan(s) have not uploaded yet. Connect to the internet first, or they may be lost. End shift anyway?"
		: "End your shift on this phone?";
	if (confirm(msg)) {
		store.del("session");
		route();
	}
};

/* ============ Scanner ============ */

/**
 * TODO: Update docs.
 */

let stream = null;
let watchId = null;
let bestFix = null;
let scanning = false;
let detector = null;
let loopTimer = null;

const work = document.createElement("canvas");

/**
 * TODO: Update docs.
 * @returns 
 */
async function startScan() {
	show("scan");
	$("s-msg").textContent = "Point the camera at the checkpoint code.";
	$("s-gps").textContent = "Getting location…";

	bestFix = null;
	scanning = true;

	startGps();
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: { ideal: "environment" },
				width: { ideal: 1280 },
				height: { ideal: 720 },
			},
			audio: false,
		});
	} catch (e) {
		stopScan();

		return showResult(
			"bad",
			"Camera blocked",
			"Allow camera access for this page in your browser settings, then try again.",
		);
	}

	const video = $("video");
	video.srcObject = stream;
	await video.play().catch(() => {});
	if ("BarcodeDetector" in window) {
		try {
			const formats = await BarcodeDetector.getSupportedFormats();
			if (formats.includes("qr_code"))
				detector = new BarcodeDetector({
					formats: ["qr_code"],
				});
		} catch (e) {
			detector = null;
		}
	}
	loop();
}

/**
 * TODO: Update docs.
 * @returns 
 */
async function loop() {
	if (!scanning) return;

	const video = $("video");
	let text = null;
	if (video.readyState >= 2) {
		try {
			if (detector) {
				const codes = await detector.detect(video);
				if (codes.length) text = codes[0].rawValue;
			} else if (window.jsQR) {
				const w = 640,
					h =
						Math.round(
							(640 * video.videoHeight) / video.videoWidth,
						) || 480;
				work.width = w;
				work.height = h;
				const ctx = work.getContext("2d", {
					willReadFrequently: true,
				});
				ctx.drawImage(video, 0, 0, w, h);
				const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
					inversionAttempts: "dontInvert",
				});
				if (found) text = found.data;
			}
		} catch (e) {
			/* keep trying */
		}
	}
	if (text && text.indexOf(QR_PREFIX) === 0) return onCode(text);

	if (text) $("s-msg").textContent = "That is not a checkpoint code.";

	loopTimer = setTimeout(loop, 180);
}

/**
 * TODO: Update docs.
 * @returns 
 */
function startGps() {
	if (!("geolocation" in navigator)) {
		$("s-gps").textContent = "This phone has no GPS support.";
		return;
	}
	watchId = navigator.geolocation.watchPosition(
		(pos) => {
			const c = pos.coords;
			if (!bestFix || c.accuracy <= bestFix.accuracy) {
				bestFix = {
					lat: c.latitude,
					lng: c.longitude,
					accuracy: c.accuracy,
				};
			}
			$("s-gps").textContent =
				"Location found (within " +
				Math.round(bestFix.accuracy) +
				" m)";
		},
		(err) => {
			$("s-gps").textContent =
				err.code === 1
					? "Location blocked. Allow location for this page in your browser settings."
					: "Still looking for GPS. Move away from walls if you can.";
		},
		{ enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
	);
}

/**
 * TODO: Update docs.
 */
function stopScan() {
	scanning = false;
	clearTimeout(loopTimer);

	if (stream) stream.getTracks().forEach((t) => t.stop());
	stream = null;

	if (watchId !== null) navigator.geolocation.clearWatch(watchId);
	watchId = null;
}

$("s-cancel").onclick = () => {
	stopScan();
	route();
};
document.addEventListener("visibilitychange", () => {
	if (document.hidden && scanning) {
		stopScan();
		route();
	}
});

/**
 * TODO: Update docs.
 * @returns 
 */
function captureEvidence() {
	const video = $("video");
	const w = 480;
	const h = Math.round((480 * video.videoHeight) / video.videoWidth) || 360;
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	c.getContext("2d").drawImage(video, 0, 0, w, h);
	return c.toDataURL("image/jpeg", 0.6);
}

/**
 * TODO: Update docs.
 * @param {*} text 
 * @returns 
 */
async function onCode(text) {
	scanning = false;
	clearTimeout(loopTimer);
	$("s-msg").textContent = "Code read. Checking location…";

	const evidence = captureEvidence();
	const takenAt = new Date().toISOString();

	const start = Date.now();
	while (
		(!bestFix || bestFix.accuracy > GOOD_ACCURACY_M) &&
		Date.now() - start < GPS_WAIT_MS
	) {
		await new Promise((r) => setTimeout(r, 400));
	}

	const fix = bestFix;
	stopScan();

	if (!fix) {
		return showResult(
			"bad",
			"No location",
			"The scan was not saved because GPS is off or blocked. Turn on location and scan again.",
		);
	}

	const device = store.get("device"),
		session = store.get("session");

	const payload = {
		action: "scan",
		guard_id: device.guard_id,
		device_token: device.device_token,
		session_token: session.token,
		qr: text,
		lat: fix.lat,
		lng: fix.lng,
		accuracy: fix.accuracy,
		client_time: takenAt,
		scan_id: uuid(),
		evidence,
	};
	await submit(payload, true);
}

/* ============ Upload + offline queue ============ */

/**
 * TODO: Update docs.
 * @param {*} payload 
 * @param {*} interactive 
 * @returns 
 */
async function submit(payload, interactive) {
	try {
		const r = await api(payload);
		handleServerReply(r, payload, interactive);
		return true;

	} catch (e) {
		if (!(e instanceof NetworkError)) throw e;
		if (interactive) {
			enqueue(payload);
			addHistory({
				name: "Checkpoint (not uploaded yet)",
				time: payload.client_time,
				kind: "warn",
				label: "Saved on phone",
			});
			showResult(
				"warn",
				"Saved on this phone",
				"No internet right now. The scan will upload automatically when you are back online. The office will see it was uploaded late.",
			);
		}
		return false;
	}
}

/**
 * TODO: Update docs.
 * @param {*} r 
 * @param {*} payload 
 * @param {*} interactive 
 * @returns 
 */
function handleServerReply(r, payload, interactive) {
	if (r.relogin) store.del("session");
	if (r.reenroll) {
		store.del("device");
		store.del("session");
	}
	if (!r.ok) {
		addHistory({
			name: "Scan rejected",
			time: payload.client_time,
			kind: "bad",
			label: r.error,
		});
		if (interactive) showResult("bad", "Not recorded", r.error);
		return;
	}

	const flags = (r.flags || "").split(" ").filter(Boolean);
	const warnings = flags.map((f) => FLAG_TEXT[f] || f);
	addHistory({
		name: r.cp_name,
		time: r.server_time || payload.client_time,
		kind: warnings.length ? "warn" : "ok",
		label: warnings.length ? "Recorded, needs review" : "Recorded",
	});

	if (interactive) {
		showResult(
			warnings.length ? "warn" : "ok",
			r.cp_name,
			null,
			warnings,
			new Date(r.server_time || payload.client_time),
		);
	}
}

/**
 * TODO: Update docs.
 * @param {*} payload 
 */
function enqueue(payload) {
	const q = store.get("queue") || [];
	q.push(payload);
	while (q.length > MAX_QUEUE) q.shift();
	try {
		store.set("queue", q);
	} catch (e) {
		// Storage full: keep the scan, drop its photo.
		payload.evidence = null;
		store.set(
			"queue",
			q.map((p) => Object.assign({}, p, { evidence: null })),
		);
	}
}

let flushing = false;
async function flushQueue() {
	if (flushing) return;
	
	flushing = true;
	try {
		let q = store.get("queue") || [];
		while (q.length) {
			const sent = await submit(q[0], false);
			if (!sent) break;
			q = (store.get("queue") || []).slice(1);
			store.set("queue", q);
		}
	} finally {
		flushing = false;
		if ($("home").classList.contains("on")) renderHome();
	}
}

/* ============ Result ============ */

/**
 * TODO: Update docs,
 * @param {*} kind 
 * @param {*} title 
 * @param {*} message 
 * @param {*} warnings 
 * @param {*} time 
 */
function showResult(kind, title, message, warnings, time) {
	const mark = {
		ok: "Recorded",
		warn: "Recorded, needs review",
		bad: "Not recorded",
	}[kind];
	$("r-mark").className = "result-mark " + kind;
	$("r-mark").textContent =
		kind === "warn" && !warnings ? "Waiting to upload" : mark;
	$("r-name").textContent = title;
	$("r-time").textContent = message || (time ? time.toLocaleString() : "");
	$("r-warn").innerHTML = "";
	(warnings || []).forEach((w) => {
		const li = document.createElement("li");
		li.textContent = w;
		$("r-warn").appendChild(li);
	});
	show("result");
}
$("r-next").onclick = route;

/* ============ Start ============ */

window.addEventListener("online", () => {
	flushQueue();
	if ($("home").classList.contains("on")) renderHome();
});

window.addEventListener("offline", () => {
	if ($("home").classList.contains("on")) renderHome();
});

setInterval(flushQueue, 60000);
route();

if (store.get("device")) flushQueue();
