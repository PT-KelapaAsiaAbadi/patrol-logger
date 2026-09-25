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
}

export async function startScanner(
	video: HTMLVideoElement,
	onCode: (text: string) => void,
): Promise<ScannerHandle> {
	if (!window.isSecureContext)
		throw "insecure_context" satisfies ScannerError;
	if (!(await QrScanner.hasCamera()))
		throw "no_camera" satisfies ScannerError;

	// qr-scanner can still report a frame it was decoding when stop() was called; drop those.
	let stopped = false;
	const scanner = new QrScanner(
		video,
		(result) => {
			if (!stopped) onCode(result.data);
		},
		{
			preferredCamera: "environment",
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

	return {
		stop: () => {
			stopped = true;
			scanner.destroy();
		},
	};
}
