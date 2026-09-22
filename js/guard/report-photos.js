// @ts-check
/** Turns photos picked for a report into small JPEGs, to save the guard's mobile data. */
import { REPORTS } from '../config.js';

/**
 * @param {File} file
 * @returns {Promise<import('../types.js').ReportPhoto>}
 */
export async function prepareReportPhoto(file) {
  const image = await loadImage(file);
  const scale = Math.min(1, REPORTS.photoMaxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, canvas.width, canvas.height);
  // lastModified is when the camera saved the photo; the server uses it to spot old photos.
  return { dataUrl: canvas.toDataURL('image/jpeg', REPORTS.jpegQuality), takenAt: file.lastModified || Date.now() };
}

/** @param {File} file @returns {Promise<HTMLImageElement>} */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a photo this phone can read.'));
    };
    image.src = url;
  });
}
