// Writes a video file showing one QR code, for Chromium's fake camera
// (--use-file-for-fake-video-capture). Y4M is raw YUV, so it needs no image libraries.
import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

const W = 640;
const H = 480;

export function writeQrVideo(payload, file) {
	const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
	const n = qr.modules.size;
	const quiet = 4; // white border the QR standard asks for
	const scale = Math.floor((Math.min(W, H) * 0.8) / (n + 2 * quiet));
	const x0 = (W - (n + 2 * quiet) * scale) >> 1;
	const y0 = (H - (n + 2 * quiet) * scale) >> 1;

	const luma = Buffer.alloc(W * H, 235); // white
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (!qr.modules.data[r * n + c]) continue;
			const x = x0 + (c + quiet) * scale;
			const y = y0 + (r + quiet) * scale;
			for (let dy = 0; dy < scale; dy++) {
				luma.fill(16, (y + dy) * W + x, (y + dy) * W + x + scale); // black
			}
		}
	}
	const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128); // no colour
	const frame = Buffer.concat([Buffer.from("FRAME\n"), luma, chroma]);
	const header = Buffer.from(
		`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`,
	);
	writeFileSync(file, Buffer.concat([header, frame, frame, frame]));
}
