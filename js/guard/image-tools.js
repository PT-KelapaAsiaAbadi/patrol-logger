// @ts-check
/** Camera frame helpers: grab a frame, judge its quality, read a QR code from it. */
import { CAPTURE } from '../config.js';

const QUALITY_SAMPLE_WIDTH = 200;

/**
 * Copy the current video frame, scaled so its longest side is at most `maxSide`.
 * @param {HTMLVideoElement} video
 * @param {number} [maxSide]
 */
export function captureFrame(video, maxSide = CAPTURE.maxPhotoSide) {
  const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  getContext(canvas).drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** @param {HTMLCanvasElement} canvas */
export const toJpeg = (canvas) => canvas.toDataURL('image/jpeg', CAPTURE.jpegQuality);

/**
 * Sharpness is the variance of the Laplacian of a small grey copy; brightness is its mean grey level (0 to 255).
 * @param {HTMLCanvasElement} canvas
 */
export function measureImage(canvas) {
  const width = QUALITY_SAMPLE_WIDTH;
  const height = Math.max(1, Math.round((QUALITY_SAMPLE_WIDTH * canvas.height) / canvas.width));
  const sample = document.createElement('canvas');
  sample.width = width;
  sample.height = height;
  const context = getContext(sample);
  context.drawImage(canvas, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const grey = new Float32Array(width * height);
  let total = 0;
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
    total += grey[i];
  }

  // Welford's running variance of the Laplacian.
  let count = 0;
  let mean = 0;
  let sumOfSquares = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const laplacian = grey[i - 1] + grey[i + 1] + grey[i - width] + grey[i + width] - 4 * grey[i];
      count++;
      const delta = laplacian - mean;
      mean += delta / count;
      sumOfSquares += delta * (laplacian - mean);
    }
  }

  return { sharpness: count > 1 ? sumOfSquares / (count - 1) : 0, brightness: total / grey.length };
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
