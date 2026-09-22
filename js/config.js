// @ts-check
/** Every tunable number in one place. */

export const QR_PREFIX = 'GP1';

export const STORAGE_KEYS = Object.freeze({
  server: 'patrol_server_v2',
  device: 'patrol_device_v2',
  deviceKeys: 'device-keys',
  uploadQueue: 'upload-queue',
  photoPrefix: 'photo:',
});

/**
 * Rules the owner can change in Setup, stored with the server state.
 * @type {Readonly<import('./types.js').ServerConfig>}
 */
export const SERVER_DEFAULTS = Object.freeze({
  rejectClearlyOutOfRange: false,
  defaultRadiusM: 50,
  maxAccuracyM: 100,
  maxSpeedKmh: 40,
  duplicateWindowMin: 3,
  lateUploadMin: 10,
  shiftHours: 12,
});

export const AUTH = Object.freeze({
  maxPinAttempts: 5,
  maxEnrollmentAttempts: 5,
  enrollmentCodeMinutes: 30,
  maxLoginClockSkewMs: 5 * 60_000,
  queuedUploadGraceMs: 2 * 3_600_000,
  pinHashRounds: 200,
});

export const CHECKS = Object.freeze({
  calibrationAccuracyM: 30,
  confidentAccuracyM: 30,
  minTravelKm: 0.2,
  identicalPositionMinGapMs: 5 * 60_000,
  sameTimeWindowMs: 60_000,
  clockAheadToleranceMs: 2 * 60_000,
});

/** The camera reads codes; it never keeps an image. */
export const SCANNER = Object.freeze({
  /** Frames are scaled down before decoding so old phones keep up. */
  readFrameMaxSide: 480,
  readEveryMs: 200,
  goodGpsAccuracyM: 30,
  gpsWaitMs: 10_000,
});

export const ROUNDS = Object.freeze({
  defaults: Object.freeze({ start: '22:00', end: '06:00', everyMinutes: 120 }),
  intervalChoices: Object.freeze([60, 90, 120, 180, 240]),
  minimumIntervalMinutes: 15,
  detourFactor: 1.3,
  patrolSpeedKmh: 3,
  minutesPerCheckpoint: 1,
  rushedRatio: 0.7,
  exactSearchLimit: 8,
});

export const REPORTS = Object.freeze({
  maxPhotos: 5,
  maxTextLength: 2000,
  photoMaxSide: 800,
  jpegQuality: 0.6,
  /** A report photo taken this long before the scan was probably not taken on this visit. */
  oldPhotoToleranceMin: 10,
});

export const NETWORK_DELAY_MS = Object.freeze({ min: 180, spread: 220 });
