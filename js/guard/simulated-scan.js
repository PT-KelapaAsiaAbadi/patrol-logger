// @ts-check
/** Builds a scan without the camera, for testing each check on purpose. */
import { createSyntheticPhoto } from '../domain/synthetic-photo.js';
import { hasPosition, offsetPosition } from '../lib/geo.js';

const FALLBACK_POSITION = { lat: -7.2575, lng: 112.7521 };
const GUARD_POST_OFFSET = { northM: 3, eastM: 2 };
const OLD_CODE_TOKEN = 'kOLDCOPY';
const CODE_PHOTO_HUE = 40;
const AREA_PHOTO_HUE = 150;
const SECONDS_BETWEEN_PHOTOS = 25;

/**
 * @typedef {'current' | 'old'} CodeChoice
 * @typedef {'at' | 'post' | 'far' | 'weak'} LocationChoice
 * @typedef {'normal' | 'reuse' | 'dark' | 'none'} PhotoChoice
 */

/**
 * @param {object} options
 * @param {import('../types.js').Checkpoint} options.checkpoint
 * @param {import('../types.js').Checkpoint | undefined} options.guardPostCheckpoint  The first checkpoint, used as the guard post.
 * @param {CodeChoice} options.code
 * @param {LocationChoice} options.location
 * @param {PhotoChoice} options.photos
 * @param {string | null} options.lastAreaPhoto
 * @returns {import('./uploads.js').ScanInput}
 */
export function buildSimulatedScan({ checkpoint, guardPostCheckpoint, code, location, photos, lastAreaPhoto }) {
  const anchor = hasPosition(checkpoint) ? checkpoint : FALLBACK_POSITION;
  const postAnchor = hasPosition(guardPostCheckpoint) ? guardPostCheckpoint : anchor;
  const { position, accuracy } = simulatedPosition(location, anchor, postAnchor);

  const now = Date.now();
  const area = simulatedAreaPhoto(photos, checkpoint.name, lastAreaPhoto);
  return {
    qr: `GP1|${checkpoint.id}|${code === 'current' ? checkpoint.token : OLD_CODE_TOKEN}`,
    lat: position.lat,
    lng: position.lng,
    accuracy,
    codeTime: new Date(now - SECONDS_BETWEEN_PHOTOS * 1000).toISOString(),
    areaTime: area.photo ? new Date(now).toISOString() : null,
    areaQuality: area.photo ? area.quality : null,
    codePhoto: createSyntheticPhoto({ title: 'Code photo', subtitle: checkpoint.name, hue: CODE_PHOTO_HUE }),
    areaPhoto: area.photo,
  };
}

/**
 * @param {LocationChoice} choice
 * @param {import('../types.js').Position} anchor
 * @param {import('../types.js').Position} postAnchor
 */
function simulatedPosition(choice, anchor, postAnchor) {
  const jitter = () => Math.random() * 8 - 4;
  switch (choice) {
    case 'post':
      return { position: offsetPosition(postAnchor, GUARD_POST_OFFSET.northM, GUARD_POST_OFFSET.eastM), accuracy: 10 };
    case 'far':
      return { position: offsetPosition(anchor, 1900, 600), accuracy: 12 };
    case 'weak':
      return { position: offsetPosition(anchor, 60, -40), accuracy: 150 };
    default:
      return { position: offsetPosition(anchor, jitter(), jitter()), accuracy: 8 + Math.round(Math.random() * 10) };
  }
}

/**
 * @param {PhotoChoice} choice @param {string} checkpointName @param {string | null} lastAreaPhoto
 * @returns {{ photo: string | null, quality: 'ok' | 'dark' }}
 */
function simulatedAreaPhoto(choice, checkpointName, lastAreaPhoto) {
  const fresh = (dark = false) =>
    createSyntheticPhoto({ title: 'Area photo', subtitle: checkpointName, hue: AREA_PHOTO_HUE, dark });
  switch (choice) {
    case 'none':
      return { photo: null, quality: 'ok' };
    case 'dark':
      return { photo: fresh(true), quality: 'dark' };
    case 'reuse':
      return { photo: lastAreaPhoto ?? fresh(), quality: 'ok' };
    default:
      return { photo: fresh(), quality: 'ok' };
  }
}
