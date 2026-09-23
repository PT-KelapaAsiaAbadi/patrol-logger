// @ts-check
/** Camera frame helpers: grab a frame and read a QR code from it. Frames are never stored. */

/**
 * Copy the current video frame, scaled so its longest side is at most `maxSide`.
 * @param {HTMLVideoElement} video
 * @param {number} maxSide
 */
export function captureFrame(video, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  getContext(canvas).drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The browser's built-in QR reader when available (Chrome on Android), otherwise null. */
export async function createQrDetector() {
  const BarcodeDetectorClass = /** @type {any} */ (window).BarcodeDetector;
  if (!BarcodeDetectorClass) return null;
  try {
    const formats = await BarcodeDetectorClass.getSupportedFormats();
    return formats.includes('qr_code') ? new BarcodeDetectorClass({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

/**
 * Read a QR code with the built-in reader, falling back to the jsQR library.
 * @param {HTMLCanvasElement} canvas
 * @param {any} detector
 * @returns {Promise<string | null>}
 */
export async function decodeQrCode(canvas, detector) {
  try {
    if (detector) {
      const codes = await detector.detect(canvas);
      return codes.length ? codes[0].rawValue : null;
    }
    const jsQR = /** @type {any} */ (window).jsQR;
    if (!jsQR) return null;
    const image = getContext(canvas).getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  } catch {
    return null;
  }
}

/** @param {HTMLCanvasElement} canvas */
function getContext(canvas) {
  return /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
}
