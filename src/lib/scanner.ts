/**
 * Thin wrapper around qr-scanner so the rest of the app never touches it directly.
 * This is the file to replace if you rebuild the scanner by hand.
 *
 * What qr-scanner does under the hood:
 *   1. getUserMedia({ video: { facingMode: 'environment' } }) opens the back camera
 *   2. the stream plays in a <video> element
 *   3. a few times a second, a frame is drawn to a <canvas>
 *   4. the frame is decoded by the browser's BarcodeDetector if it has one (most Android Chrome),
 *      otherwise by a bundled decoder running in a Web Worker so the UI doesn't freeze
 */
import QrScanner from "qr-scanner";

export type ScannerError =
	"no_camera" | "permission_denied" | "insecure_context" | "unknown";

export interface ScannerHandle {
	stop: () => void;
	/** Whether the browser can switch this camera's flashlight (torch) on and off. */
	hasFlash: () => Promise<boolean>;
	setFlash: (on: boolean) => Promise<void>;
}

/*
	Which back camera to use. Asked for "the back camera", Chrome on Android often opens a secondary
	one (wide-angle or macro) that has no flash and focuses worse; the flash belongs to the main
	camera. So when the opened camera has no flash, the other back cameras are tried once, and the
	one with a flash is remembered on this phone. "none" remembers that no back camera has one
	(iPhones, most laptops), so the search isn't repeated every time.
*/
const CAMERA_KEY = "patrol-scan-camera";
const BACK_CAMERA = /back|rear|environment|belakang/i;

function savedCamera(): string | null {
	try {
		return localStorage.getItem(CAMERA_KEY);
	} catch {
		return null;
	}
}

function saveCamera(choice: string) {
	try {
		localStorage.setItem(CAMERA_KEY, choice);
	} catch {
		/* private mode: search again next time */
	}
}

export async function startScanner(
	video: HTMLVideoElement,
	onCode: (text: string) => void,
): Promise<ScannerHandle> {
	if (!window.isSecureContext)
		throw "insecure_context" satisfies ScannerError;
	if (!(await QrScanner.hasCamera()))
		throw "no_camera" satisfies ScannerError;

	const saved = savedCamera();

	// qr-scanner can still report a frame it was decoding when stop() was called; drop those.
	let stopped = false;
	const scanner = new QrScanner(
		video,
		(result) => {
			if (!stopped) onCode(result.data);
		},
		{
			// A remembered camera that's gone falls back to any camera; the search below fixes that.
			preferredCamera: saved && saved !== "none" ? saved : "environment",
			maxScansPerSecond: 5, // enough to feel instant, low enough for old CPUs
			returnDetailedScanResult: true,
		},
	);

	try {
		await scanner.start();
	} catch (e) {
		scanner.destroy();
		const name = e instanceof Error ? e.name : String(e);
		throw (
			/NotAllowed|Permission/i.test(name)
				? "permission_denied"
				: "unknown"
		) satisfies ScannerError;
	}

	const hasFlash = () => scanner.hasFlash().catch(() => false);
	if (saved !== "none" && !(await hasFlash())) {
		const backs = (
			await QrScanner.listCameras(true).catch(() => [])
		).filter((c) => BACK_CAMERA.test(c.label));
		let found = false;
		for (const c of backs) {
			try {
				await scanner.setCamera(c.id);
				if (await hasFlash()) {
					saveCamera(c.id);
					found = true;
					break;
				}
			} catch {
				/* couldn't open this one: try the next */
			}
		}
		if (!found) {
			saveCamera("none");
			await scanner.setCamera("environment").catch(() => {});
		}
	}

	return {
		stop: () => {
			stopped = true;
			scanner.destroy();
		},
		// The torch is a camera setting (MediaStreamTrack "torch"): Chromium browsers on Android
		// offer it for a back camera with a flash; elsewhere hasFlash() is false.
		hasFlash,
		setFlash: (on) => (on ? scanner.turnFlashOn() : scanner.turnFlashOff()),
	};
}
