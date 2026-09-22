// @ts-check
/**
 * The scan checks. Each function only reads its inputs and returns flags,
 * so the rules can be read and tested on their own.
 */
import { CHECKS, QR_PREFIX } from '../config.js';
import { Flag } from '../domain/flags.js';
import { distanceMeters, hasPosition } from '../lib/geo.js';

/** @typedef {import('../types.js').ScanDetails} ScanDetails */
/** @typedef {import('../types.js').Checkpoint} Checkpoint */
/** @typedef {import('../types.js').Guard} Guard */
/** @typedef {import('../types.js').LogEntry} LogEntry */
/** @typedef {import('../types.js').ServerConfig} ServerConfig */

/**
 * "GP1|CP01|token" into its parts, or null when it is not a patrol code.
 * @param {string} qrText
 */
export function parseCheckpointCode(qrText) {
  const parts = String(qrText ?? '').split('|');
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return null;
  return { checkpointId: parts[1], token: parts[2] };
}

/**
 * Distance from the checkpoint and GPS quality.
 * @param {ScanDetails & import('../types.js').Position} scan
 * @param {Checkpoint} checkpoint
 * @param {Guard} guard
 * @param {ServerConfig} config
 */
export function checkLocation(scan, checkpoint, guard, config) {
  /** @type {string[]} */
  const flags = [];
  let distance = null;
  let calibrate = false;
  let rejectAsOutOfRange = false;
  const accuracy = scan.accuracy ?? Infinity;

  if (!hasPosition(checkpoint)) {
    // A supervisor with good GPS sets the checkpoint's location by scanning it.
    calibrate = guard.role === 'supervisor' && accuracy <= CHECKS.calibrationAccuracyM;
    flags.push(calibrate ? Flag.CALIBRATED : Flag.NO_GEOFENCE);
    if (calibrate) distance = 0;
  } else {
    distance = distanceMeters(scan, checkpoint);
    const radius = checkpoint.radius || config.defaultRadiusM;
    // Benefit of the doubt up to the reported GPS accuracy.
    const isOutside = distance - (scan.accuracy ?? 0) > radius;
    if (isOutside) {
      flags.push(Flag.OUT_OF_RANGE);
      rejectAsOutOfRange = config.rejectClearlyOutOfRange && accuracy <= CHECKS.confidentAccuracyM;
    }
  }

  if (accuracy > config.maxAccuracyM) flags.push(Flag.LOW_ACCURACY);
  return { flags, distance, calibrate, rejectAsOutOfRange };
}

/**
 * Compare with earlier scans: duplicates, travel speed, frozen GPS, and two phones carried together.
 * @param {ScanDetails & import('../types.js').Position} scan
 * @param {number} time
 * @param {Guard} guard
 * @param {Checkpoint} checkpoint
 * @param {LogEntry[]} acceptedEntries
 * @param {ServerConfig} config
 */
export function checkAgainstHistory(scan, time, guard, checkpoint, acceptedEntries, config) {
  /** @type {string[]} */
  const flags = [];
  const earlierOwnScans = acceptedEntries
    .filter((e) => e.guardId === guard.id && e.time <= time)
    .sort((a, b) => a.time - b.time);
  const previous = earlierOwnScans.at(-1);

  if (previous) {
    const minutesSince = (time - previous.time) / 60_000;
    if (previous.checkpointId === checkpoint.id && minutesSince < config.duplicateWindowMin) flags.push(Flag.DUPLICATE);
    if (previous.checkpointId !== checkpoint.id && hasPosition(previous)) {
      const km = distanceMeters(scan, previous) / 1000;
      const hours = Math.max(minutesSince / 60, 1 / 3600);
      if (km > CHECKS.minTravelKm && km / hours > config.maxSpeedKmh) flags.push(Flag.IMPOSSIBLE_TRAVEL);
    }
  }

  const frozenPosition = earlierOwnScans.some(
    (e) => e.lat === scan.lat && e.lng === scan.lng && Math.abs(time - e.time) > CHECKS.identicalPositionMinGapMs,
  );
  if (frozenPosition) flags.push(Flag.IDENTICAL_POSITION);

  const otherGuardAtSameTime = acceptedEntries.some(
    (e) =>
      e.guardId !== guard.id && e.checkpointId === checkpoint.id && Math.abs(e.time - time) < CHECKS.sameTimeWindowMs,
  );
  if (otherGuardAtSameTime) flags.push(Flag.SAME_TIME_AS_OTHER_GUARD);

  return flags;
}

/**
 * The phone's clock is never trusted, so these only flag.
 * @param {number} time
 * @param {number} receivedAt
 * @param {ServerConfig} config
 */
export function checkTiming(time, receivedAt, config) {
  /** @type {string[]} */
  const flags = [];
  if (receivedAt - time > config.lateUploadMin * 60_000) flags.push(Flag.LATE_SYNC);
  if (time - receivedAt > CHECKS.clockAheadToleranceMs) flags.push(Flag.PHONE_CLOCK_AHEAD);
  return flags;
}

/**
 * @param {ScanDetails} scan
 * @param {{ code: string | null, area: string | null }} photoHashes
 * @param {ServerConfig} config
 * @param {Record<string, string>} knownPhotoHashes
 */
export function checkPhotos(scan, photoHashes, config, knownPhotoHashes) {
  /** @type {string[]} */
  const flags = [];
  if (!photoHashes.code) flags.push(Flag.NO_PHOTO);

  if (config.requireAreaPhoto) {
    if (!photoHashes.area) {
      flags.push(Flag.NO_AREA_PHOTO);
    } else {
      if (scan.areaQuality === 'dark') flags.push(Flag.DARK_PHOTO);
      if (scan.areaQuality === 'blurry') flags.push(Flag.BLURRY_PHOTO);
      const gapSeconds = (Date.parse(scan.areaTime ?? '') - Date.parse(scan.codeTime)) / 1000;
      if (!(gapSeconds >= 0 && gapSeconds <= config.maxPhotoGapS)) flags.push(Flag.PHOTO_GAP);
    }
  }

  const hashes = [photoHashes.code, photoHashes.area].filter(Boolean);
  const reused =
    hashes.some((hash) => knownPhotoHashes[/** @type {string} */ (hash)]) ||
    (hashes.length === 2 && hashes[0] === hashes[1]);
  if (reused) flags.push(Flag.REUSED_PHOTO);

  return flags;
}
