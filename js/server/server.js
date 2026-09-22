// @ts-check
/**
 * Simulated backend. In production this becomes Supabase Edge Functions:
 * the same requests, the same checks, the same answers.
 */
import { AUTH, NETWORK_DELAY_MS, REPORTS, STORAGE_KEYS } from '../config.js';
import { Flag } from '../domain/flags.js';
import { sleep } from '../lib/async.js';
import { hashPin, randomSixDigits, randomToken, sha256Hex, verifySignature } from '../lib/crypto.js';
import { hasPosition } from '../lib/geo.js';
import { keyValueStore } from '../lib/storage.js';
import { checkAgainstHistory, checkLocation, checkTiming, parseCheckpointCode } from './checks.js';
import { appendLogEntry, verifyLogChain } from './log.js';
import { createEmptyState, loadState, saveState } from './state.js';

/** @typedef {import('../types.js').Guard} Guard */
/** @typedef {import('../types.js').Checkpoint} Checkpoint */
/** @typedef {import('../types.js').ScanDetails} ScanDetails */
/** @typedef {import('../types.js').ScanOutcome} ScanOutcome */
/** @typedef {import('../types.js').Report} Report */

/**
 * Everything about one scan that ends up in its log entry.
 * @typedef {{ guard: Guard, scan: ScanDetails, receivedAt: number }} ScanContext
 */

const MESSAGES = Object.freeze({
  badCode: 'This is not a valid checkpoint code. It may be an old or copied code.',
  noGps: 'Location is required. Turn on GPS and allow location for this page.',
  replayed: 'This scan was already received or arrived out of order.',
  photosDoNotMatch: 'The photos do not match the signed report.',
  sessionEnded: 'Your shift login has ended. Enter your PIN again.',
  phoneNotSetUp: 'This phone is not set up for this guard.',
  guardUnavailable: 'Guard not found or not active.',
  badRequest: 'Bad request.',
});

const simulateNetwork = () => sleep(NETWORK_DELAY_MS.min + Math.random() * NETWORK_DELAY_MS.spread);

/** @param {string} text */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** @param {string[]} values */
const unique = (values) => [...new Set(values)];

/** @param {string} error @returns {import('../types.js').FailedResponse} */
const failure = (error) => ({ ok: false, error });

/** Emits a `reset` event when all data is cleared. */
class PatrolServer extends EventTarget {
  /** @type {import('../types.js').ServerState} */
  #state = createEmptyState();

  get state() {
    return this.#state;
  }

  load() {
    this.#state = loadState();
  }

  save() {
    saveState(this.#state);
  }

  reset() {
    this.#state = createEmptyState();
    this.save();
    this.dispatchEvent(new Event('reset'));
  }

  /** @param {string} id */
  findGuard(id) {
    return this.#state.guards.find((guard) => guard.id === id) ?? null;
  }

  /** @param {string} id */
  findCheckpoint(id) {
    return this.#state.checkpoints.find((checkpoint) => checkpoint.id === id) ?? null;
  }

  /**
   * Active checkpoints this guard patrols. A guard with no assignment patrols all of them.
   * @param {Guard} guard
   */
  assignedCheckpoints(guard) {
    const active = this.#state.checkpoints.filter((checkpoint) => checkpoint.active);
    const assigned = guard.assignedCheckpointIds;
    return assigned ? active.filter((checkpoint) => assigned.includes(checkpoint.id)) : active;
  }

  /* ----------------------------------------------------------------------
     Owner actions
     ---------------------------------------------------------------------- */

  /** @param {Guard} guard */
  issueEnrollmentCode(guard) {
    guard.enrollment = {
      code: randomSixDigits(),
      expiresAt: Date.now() + AUTH.enrollmentCodeMinutes * 60_000,
      attempts: 0,
    };
    this.save();
    return guard.enrollment;
  }

  /** @param {Checkpoint} checkpoint */
  replaceCheckpointCode(checkpoint) {
    checkpoint.token = randomToken(12);
    checkpoint.version += 1;
    this.save();
  }

  verifyLog() {
    return verifyLogChain(this.#state.log);
  }

  /** Test helper: moves one log entry's time without updating its hash. */
  tamperWithLogForTesting() {
    const entry = this.#state.log[Math.floor(this.#state.log.length / 2)];
    if (!entry) return false;
    entry.time -= 15 * 60_000;
    this.save();
    return true;
  }

  /* ----------------------------------------------------------------------
     Guard requests
     ---------------------------------------------------------------------- */

  /**
   * First-time phone setup with a one-time enrollment code.
   * @param {{ guardId: string, code: string, pin: string, publicKey: JsonWebKey }} request
   * @returns {Promise<import('../types.js').EnrollResponse>}
   */
  async enroll({ guardId, code, pin, publicKey }) {
    await simulateNetwork();
    const guard = this.findGuard(guardId.trim().toUpperCase());
    if (!guard?.active) return failure(MESSAGES.guardUnavailable);
    if (!/^\d{4,8}$/.test(pin)) return failure('PIN must be 4 to 8 digits.');

    const enrollment = guard.enrollment;
    if (!enrollment || Date.now() > enrollment.expiresAt) {
      return failure('There is no valid enrollment code for this guard. Ask your supervisor for a new one.');
    }
    if (enrollment.code !== code.trim()) return this.#recordWrongEnrollmentCode(guard, enrollment);

    guard.pinSalt = randomToken(16);
    guard.pinHash = await hashPin(pin, guard.pinSalt, AUTH.pinHashRounds);
    guard.device = { publicKey, sequence: 0, lastHash: 'START', enrolledAt: Date.now() };
    guard.session = null;
    guard.previousSession = null;
    guard.failedPins = 0;
    guard.enrollment = null;
    this.save();
    return { ok: true, guardId: guard.id, name: guard.name, role: guard.role };
  }

  /** @param {Guard} guard @param {import('../types.js').EnrollmentCode} enrollment */
  #recordWrongEnrollmentCode(guard, enrollment) {
    enrollment.attempts += 1;
    const cancelled = enrollment.attempts >= AUTH.maxEnrollmentAttempts;
    if (cancelled) guard.enrollment = null;
    this.save();
    return failure(
      cancelled ? 'Too many wrong codes. Ask your supervisor for a new one.' : 'Enrollment code is wrong.',
    );
  }

  /**
   * Start of shift: the request must be signed by the enrolled phone, and the PIN must be right.
   * @param {{ body: string, signature: string }} request
   * @returns {Promise<import('../types.js').ShiftResponse>}
   */
  async startShift({ body, signature }) {
    await simulateNetwork();
    const login = parseJson(body);
    if (!login) return failure(MESSAGES.badRequest);

    const guard = this.findGuard(login.guardId);
    if (!guard?.active) return failure(MESSAGES.guardUnavailable);
    if (!(await this.#isSignedByEnrolledPhone(guard, body, signature))) {
      return {
        ok: false,
        needsEnrollment: true,
        error: 'This phone is not set up for this guard. Ask your supervisor for a new enrollment code.',
      };
    }
    if (Math.abs(Date.now() - login.sentAt) > AUTH.maxLoginClockSkewMs) {
      return failure("This phone's clock is wrong. Set it to automatic time and try again.");
    }
    if (guard.failedPins >= AUTH.maxPinAttempts)
      return failure('Too many wrong PINs. Your supervisor must unlock your account.');
    if ((await hashPin(String(login.pin ?? ''), guard.pinSalt ?? '', AUTH.pinHashRounds)) !== guard.pinHash) {
      return this.#recordWrongPin(guard);
    }

    const sessionToken = randomToken(32);
    const expiresAt = Date.now() + this.#state.config.shiftHours * 3_600_000;
    guard.previousSession = guard.session;
    guard.session = { hash: await sha256Hex(sessionToken), expiresAt };
    guard.failedPins = 0;
    this.save();
    return {
      ok: true,
      sessionToken,
      expiresAt,
      name: guard.name,
      role: guard.role,
    };
  }

  /** @param {Guard} guard */
  #recordWrongPin(guard) {
    guard.failedPins += 1;
    this.save();
    const attemptsLeft = AUTH.maxPinAttempts - guard.failedPins;
    return failure(
      attemptsLeft > 0
        ? `Wrong PIN. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'Too many wrong PINs. Your supervisor must unlock your account.',
    );
  }

  /**
   * A scan from a guard's phone. The body is signed. A scan carries no image.
   * @param {{ body: string, signature: string }} request
   * @returns {Promise<ScanOutcome>}
   */
  async submitScan({ body, signature }) {
    await simulateNetwork();
    const request = parseJson(body);
    if (!request) return failure(MESSAGES.badRequest);

    const guard = this.findGuard(request.guardId);
    if (!guard?.active) return failure(MESSAGES.guardUnavailable);
    if (!(await this.#isSignedByEnrolledPhone(guard, body, signature))) {
      return { ok: false, needsEnrollment: true, error: MESSAGES.phoneNotSetUp };
    }
    if (!(await this.#isValidSession(guard, request.sessionToken))) {
      return { ok: false, needsLogin: true, error: MESSAGES.sessionEnded };
    }

    const earlierOutcome = this.#state.outcomes[request.scanId];
    if (earlierOutcome) return earlierOutcome;

    const sequence = await this.#followDeviceSequence(guard, request, body);
    const outcome = sequence.isReplay
      ? await this.#reject({ guard, scan: request, receivedAt: Date.now() }, null, [Flag.REPLAYED], MESSAGES.replayed)
      : await this.recordScan(guard, request, Date.now(), sequence.flags);
    this.save();
    return outcome;
  }

  /** @param {Guard} guard @param {string} body @param {string} signature */
  async #isSignedByEnrolledPhone(guard, body, signature) {
    return (
      Boolean(guard.device) && verifySignature(/** @type {JsonWebKey} */ (guard.device?.publicKey), body, signature)
    );
  }

  /**
   * Accept the current shift login, or the previous one so scans queued offline can still upload.
   * @param {Guard} guard @param {string} token
   */
  async #isValidSession(guard, token) {
    const hash = await sha256Hex(String(token ?? ''));
    const now = Date.now();
    return [guard.session, guard.previousSession].some(
      (session) => session && session.hash === hash && now <= session.expiresAt + AUTH.queuedUploadGraceMs,
    );
  }

  /**
   * Each phone numbers its scans and includes the previous request's hash,
   * like a watchman's clock tape: gaps and breaks show up.
   * @param {Guard} guard @param {{ sequence: number, previousHash: string }} request @param {string} body
   */
  async #followDeviceSequence(guard, request, body) {
    const device = /** @type {import('../types.js').EnrolledDevice} */ (guard.device);
    const expected = device.sequence + 1;
    if (request.sequence < expected) return { isReplay: true, flags: [] };

    /** @type {string[]} */
    const flags = [];
    if (request.sequence > expected) flags.push(Flag.MISSING_SCANS);
    else if (request.previousHash !== device.lastHash) flags.push(Flag.CHAIN_BROKEN);

    device.sequence = request.sequence;
    device.lastHash = await sha256Hex(body);
    return { isReplay: false, flags };
  }

  /**
   * An optional report after a scan: a note, 0 to 5 photos, or both. Signed like scans.
   * @param {{ body: string, signature: string, photos: string[] }} request
   * @returns {Promise<ScanOutcome>}
   */
  async submitReport({ body, signature, photos }) {
    await simulateNetwork();
    const request = parseJson(body);
    if (!request) return failure(MESSAGES.badRequest);

    const guard = this.findGuard(request.guardId);
    if (!guard?.active) return failure(MESSAGES.guardUnavailable);
    if (!(await this.#isSignedByEnrolledPhone(guard, body, signature))) {
      return { ok: false, needsEnrollment: true, error: MESSAGES.phoneNotSetUp };
    }
    if (!(await this.#isValidSession(guard, request.sessionToken))) {
      return { ok: false, needsLogin: true, error: MESSAGES.sessionEnded };
    }

    const earlierOutcome = this.#state.outcomes[request.reportId];
    if (earlierOutcome) return earlierOutcome;

    const problem = await validateReport(request, photos);
    if (problem) return failure(problem);

    const outcome = await this.recordReport(guard, request, photos, Date.now());
    this.save();
    return outcome;
  }

  /**
   * Store a report next to the scan it follows. The demo site also calls this directly.
   * @param {Guard} guard
   * @param {{ reportId: string, scanId: string, text: string, createdAt: number, photoTimes: number[] }} report
   * @param {string[]} photos  JPEG data URLs
   * @param {number} receivedAt
   * @returns {Promise<ScanOutcome>}
   */
  async recordReport(guard, report, photos, receivedAt) {
    const scan = this.#state.log.find((entry) => entry.scanId === report.scanId && entry.guardId === guard.id);
    if (!scan) return failure('The scan this report belongs to was not found.');

    const photoHashes = await Promise.all(photos.map((photo) => sha256Hex(photo)));
    await Promise.all(
      photos.map((photo, index) => keyValueStore.set(STORAGE_KEYS.photoPrefix + photoHashes[index], photo)),
    );

    /** @type {Report} */
    const stored = {
      reportId: report.reportId,
      scanId: report.scanId,
      guardId: guard.id,
      guardName: guard.name,
      checkpointId: scan.checkpointId,
      checkpointName: scan.checkpointName,
      time: report.createdAt,
      receivedAt,
      text: report.text.trim(),
      photos: photoHashes,
      flags: reportFlags({
        report,
        photoHashes,
        scanTime: scan.time,
        receivedAt,
        config: this.#state.config,
        knownPhotoHashes: this.#state.reportPhotoHashes,
      }),
    };
    this.#state.reports.push(stored);
    for (const hash of photoHashes) this.#state.reportPhotoHashes[hash] ??= report.reportId;
    return this.#rememberOutcome(report.reportId, { ok: true, checkpointName: scan.checkpointName, receivedAt });
  }

  /* ----------------------------------------------------------------------
     The checks
     ---------------------------------------------------------------------- */

  /**
   * Run every check and write the log entry. The demo site also calls this directly, with historical times.
   * @param {Guard} guard
   * @param {ScanDetails} scan
   * @param {number} receivedAt
   * @param {string[]} [initialFlags]  Flags already raised, such as a break in the phone's sequence.
   * @returns {Promise<ScanOutcome>}
   */
  async recordScan(guard, scan, receivedAt, initialFlags = []) {
    const context = { guard, scan, receivedAt };

    const { checkpoint, scannedCheckpoint } = this.#resolveCode(scan.qr);
    if (!checkpoint)
      return this.#reject(context, scannedCheckpoint, [Flag.BAD_CODE, ...initialFlags], MESSAGES.badCode);
    if (!hasPosition(scan)) return this.#reject(context, checkpoint, [Flag.NO_GPS, ...initialFlags], MESSAGES.noGps);

    const location = checkLocation(scan, checkpoint, guard, this.#state.config);
    if (location.rejectAsOutOfRange) {
      const metres = Math.round(location.distance ?? 0);
      const message = `You are about ${metres} m from ${checkpoint.name}. Scan at the checkpoint.`;
      return this.#reject(context, checkpoint, [...location.flags, ...initialFlags], message, metres);
    }
    if (location.calibrate) Object.assign(checkpoint, { lat: scan.lat, lng: scan.lng });

    const flags = this.#collectFlags(context, checkpoint, [...initialFlags, ...location.flags]);
    await appendLogEntry(this.#state.log, {
      ...this.#entryBase(context, checkpoint),
      result: 'ACCEPTED',
      flags,
      distance: location.distance === null ? null : Math.round(location.distance),
    });
    return this.#rememberOutcome(scan.scanId, {
      ok: true,
      checkpointName: checkpoint.name,
      flagged: flags.length > 0,
      receivedAt,
    });
  }

  /**
   * `checkpoint` is set only when the code is current and the checkpoint is active.
   * `scannedCheckpoint` is what the code claims to be, for the log when it is rejected.
   * @param {string} qr
   */
  #resolveCode(qr) {
    const code = parseCheckpointCode(qr);
    const found = code ? this.findCheckpoint(code.checkpointId) : null;
    const isValid = Boolean(code && found?.active && found.token === code.token);
    return {
      checkpoint: isValid ? found : null,
      scannedCheckpoint: found ?? { id: code?.checkpointId ?? '', name: '' },
    };
  }

  /**
   * @param {ScanContext} context @param {Checkpoint} checkpoint @param {string[]} flagsSoFar
   * @returns {string[]}
   */
  #collectFlags({ guard, scan, receivedAt }, checkpoint, flagsSoFar) {
    const config = this.#state.config;
    const time = Date.parse(scan.takenAt) || receivedAt;
    const position = /** @type {ScanDetails & import('../types.js').Position} */ (scan);
    const acceptedEntries = this.#state.log.filter((entry) => entry.result === 'ACCEPTED');
    return unique([
      ...flagsSoFar,
      ...checkAgainstHistory(position, time, guard, checkpoint, acceptedEntries, config),
      ...checkTiming(time, receivedAt, config),
    ]);
  }

  /**
   * @param {ScanContext} context
   * @param {{ id: string, name: string } | null} checkpoint
   * @param {string[]} flags
   * @param {string} error
   * @param {number | null} [distance]
   */
  async #reject(context, checkpoint, flags, error, distance = null) {
    await appendLogEntry(this.#state.log, {
      ...this.#entryBase(context, checkpoint),
      result: 'REJECTED',
      flags: unique(flags),
      distance,
    });
    return this.#rememberOutcome(context.scan.scanId, failure(error));
  }

  /** @param {ScanContext} context @param {{ id: string, name: string } | null} checkpoint */
  #entryBase({ guard, scan, receivedAt }, checkpoint) {
    return {
      scanId: scan.scanId,
      time: Date.parse(scan.takenAt) || receivedAt,
      receivedAt,
      guardId: guard.id,
      guardName: guard.name,
      checkpointId: checkpoint?.id ?? '',
      checkpointName: checkpoint?.name ?? '',
      lat: scan.lat ?? null,
      lng: scan.lng ?? null,
      accuracy: scan.accuracy ?? null,
    };
  }

  /** @param {string} scanId @param {ScanOutcome} outcome */
  #rememberOutcome(scanId, outcome) {
    this.#state.outcomes[scanId] = outcome;
    return outcome;
  }
}

/**
 * @param {{ text?: string, photoHashes?: string[], photoTimes?: number[] }} request
 * @param {string[]} photos
 * @returns {Promise<string>} A problem to report back, or an empty string.
 */
async function validateReport(request, photos) {
  const text = String(request.text ?? '').trim();
  if (!text && photos.length === 0) return 'A report needs a note or at least one photo.';
  if (text.length > REPORTS.maxTextLength) return `A note can be at most ${REPORTS.maxTextLength} characters.`;
  if (photos.length > REPORTS.maxPhotos) return `A report can have at most ${REPORTS.maxPhotos} photos.`;
  const hashes = await Promise.all(photos.map((photo) => sha256Hex(photo)));
  const signed = request.photoHashes ?? [];
  const matches = hashes.length === signed.length && hashes.every((hash, index) => hash === signed[index]);
  return matches ? '' : MESSAGES.photosDoNotMatch;
}

/**
 * Report photos are the only images left, so the reuse check lives here now.
 * @param {object} options
 * @param {{ createdAt: number, photoTimes: number[] }} options.report
 * @param {string[]} options.photoHashes
 * @param {number} options.scanTime
 * @param {number} options.receivedAt
 * @param {import('../types.js').ServerConfig} options.config
 * @param {Record<string, string>} options.knownPhotoHashes  Hashes from every earlier report.
 */
function reportFlags({ report, photoHashes, scanTime, receivedAt, config, knownPhotoHashes }) {
  /** @type {string[]} */
  const flags = [];

  const oldestAllowed = scanTime - REPORTS.oldPhotoToleranceMin * 60_000;
  if (report.photoTimes.some((takenAt) => takenAt < oldestAllowed)) flags.push(Flag.OLD_REPORT_PHOTO);

  const repeatedInThisReport = new Set(photoHashes).size !== photoHashes.length;
  const sentBefore = photoHashes.some((hash) => hash in knownPhotoHashes);
  if (repeatedInThisReport || sentBefore) flags.push(Flag.REUSED_REPORT_PHOTO);

  if (receivedAt - report.createdAt > config.lateUploadMin * 60_000) flags.push(Flag.LATE_SYNC);
  return flags;
}

/** @param {string | null} hash @returns {Promise<string | null>} */
export function loadPhoto(hash) {
  return hash ? keyValueStore.get(STORAGE_KEYS.photoPrefix + hash) : Promise.resolve(null);
}

export const server = new PatrolServer();
