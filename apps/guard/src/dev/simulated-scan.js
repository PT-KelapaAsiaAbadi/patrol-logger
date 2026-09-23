// @ts-check
/** Builds a scan without the camera, for testing each check on purpose. */
import { hasPosition, offsetPosition } from '../../../../shared/lib/geo.js';

const FALLBACK_POSITION = { lat: -7.2575, lng: 112.7521 };
const GUARD_POST_OFFSET = { northM: 3, eastM: 2 };
const OLD_CODE_TOKEN = 'kOLDCOPY';

/**
 * @typedef {'current' | 'old'} CodeChoice
 * @typedef {'at' | 'post' | 'far' | 'weak'} LocationChoice
 */

/**
 * @param {object} options
 * @param {import('../../../../shared/types.js').Checkpoint} options.checkpoint
 * @param {import('../../../../shared/types.js').Checkpoint | undefined} options.guardPostCheckpoint  The first checkpoint, used as the guard post.
 * @param {CodeChoice} options.code
 * @param {LocationChoice} options.location
 * @returns {import('../uploads.js').ScanInput}
 */
export function buildSimulatedScan({ checkpoint, guardPostCheckpoint, code, location }) {
  const anchor = hasPosition(checkpoint) ? checkpoint : FALLBACK_POSITION;
  const postAnchor = hasPosition(guardPostCheckpoint) ? guardPostCheckpoint : anchor;
  const { position, accuracy } = simulatedPosition(location, anchor, postAnchor);

  return {
    qr: `GP1|${checkpoint.id}|${code === 'current' ? checkpoint.token : OLD_CODE_TOKEN}`,
    lat: position.lat,
    lng: position.lng,
    accuracy,
    takenAt: new Date().toISOString(),
  };
}

/**
 * @param {LocationChoice} choice
 * @param {import('../../../../shared/types.js').Position} anchor
 * @param {import('../../../../shared/types.js').Position} postAnchor
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
