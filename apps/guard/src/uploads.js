// @ts-check
/** Signs scans and reports, sends them, and keeps them on the phone while there is no signal. */
import { randomId, sha256Hex } from '../../../shared/lib/crypto.js';
import { formatClock } from '../../../shared/lib/format.js';
import { server } from './api.js';
import { device } from './device.js';

/**
 * @typedef {object} ScanInput
 * @property {string} qr
 * @property {number | null} lat
 * @property {number | null} lng
 * @property {number | null} accuracy
 * @property {string} takenAt
 *
 * @typedef {'recorded' | 'flagged' | 'rejected' | 'queued'} ScanResultKind
 *
 * @typedef {object} ScanResult
 * @property {ScanResultKind} kind
 * @property {string} scanId
 * @property {string} checkpointName
 * @property {string} message
 *
 * @typedef {{ kind: 'sent' | 'queued' | 'failed', message: string }} ReportResult
 */

/**
 * @param {ScanInput} scan
 * @param {string} checkpointName  Name of the checkpoint the guard chose.
 * @returns {Promise<ScanResult>}
 */
export async function submitScan(scan, checkpointName) {
  const scanId = randomId();
  const upload = await signScan(scan, scanId, checkpointName);

  if (device.state.offline) {
    await queue(upload);
    return { kind: 'queued', scanId, checkpointName, message: 'Saved on this phone. It uploads when signal returns.' };
  }

  const outcome = await server.submitScan({ body: upload.body, signature: upload.signature });
  await applySessionChanges(outcome);
  if (!outcome.ok)
    return { kind: 'rejected', scanId, checkpointName, message: outcome.error ?? 'The scan was not recorded.' };

  const time = formatClock(outcome.receivedAt ?? Date.now());
  return outcome.flagged
    ? {
        kind: 'flagged',
        scanId,
        checkpointName,
        message: `Recorded at ${time}. Your supervisor will review this scan.`,
      }
    : { kind: 'recorded', scanId, checkpointName, message: `Recorded at ${time}.` };
}

/**
 * @param {{ scanId: string, checkpointName: string, text: string, photos: import('../../../shared/types.js').ReportPhoto[] }} report
 * @returns {Promise<ReportResult>}
 */
export async function submitReport(report) {
  const upload = await signReport(report);
  if (device.state.offline) {
    await queue(upload);
    return { kind: 'queued', message: 'Saved on this phone. It uploads when signal returns.' };
  }
  const outcome = await server.submitReport({ body: upload.body, signature: upload.signature, photos: upload.photos });
  await applySessionChanges(outcome);
  return outcome.ok
    ? { kind: 'sent', message: 'Your supervisor can see it now.' }
    : { kind: 'failed', message: outcome.error ?? 'The report was not sent.' };
}

/** Upload waiting scans and reports in order. Stops at the first one that needs the guard to log in again. */
export async function uploadQueued() {
  let waiting = await device.readQueue();
  while (waiting.length && !device.state.offline) {
    const [next] = waiting;
    const outcome =
      next.kind === 'report'
        ? await server.submitReport({ body: next.body, signature: next.signature, photos: next.photos })
        : await server.submitScan({ body: next.body, signature: next.signature });
    if (outcome.needsLogin || outcome.needsEnrollment) {
      await applySessionChanges(outcome);
      return;
    }
    waiting = waiting.slice(1);
    await device.writeQueue(waiting);
  }
}

/** @param {import('./device.js').QueuedUpload} upload */
async function queue(upload) {
  const waiting = await device.readQueue();
  waiting.push(upload);
  await device.writeQueue(waiting);
}

/**
 * The body carries this phone's next sequence number and the hash of its previous request,
 * so the server can tell if anything went missing in between.
 * @param {ScanInput} scan @param {string} scanId @param {string} checkpointName
 * @returns {Promise<import('./device.js').QueuedUpload>}
 */
async function signScan(scan, scanId, checkpointName) {
  const state = device.state;
  const body = JSON.stringify({
    action: 'scan',
    guardId: state.guardId,
    sessionToken: state.session?.token,
    sequence: state.sequence + 1,
    previousHash: state.lastHash,
    scanId,
    qr: scan.qr,
    lat: scan.lat,
    lng: scan.lng,
    accuracy: scan.accuracy === null ? null : Math.round(scan.accuracy),
    takenAt: scan.takenAt,
  });

  state.sequence += 1;
  state.lastHash = await sha256Hex(body);
  device.save();

  return {
    kind: 'scan',
    body,
    signature: await device.sign(body),
    photos: [],
    takenAt: Date.parse(scan.takenAt),
    checkpointName,
  };
}

/**
 * @param {{ scanId: string, checkpointName: string, text: string, photos: import('../../../shared/types.js').ReportPhoto[] }} report
 * @returns {Promise<import('./device.js').QueuedUpload>}
 */
async function signReport(report) {
  const createdAt = Date.now();
  const dataUrls = report.photos.map((photo) => photo.dataUrl);
  const body = JSON.stringify({
    action: 'report',
    guardId: device.state.guardId,
    sessionToken: device.state.session?.token,
    reportId: randomId(),
    scanId: report.scanId,
    text: report.text,
    createdAt,
    photoHashes: await Promise.all(dataUrls.map((url) => sha256Hex(url))),
    photoTimes: report.photos.map((photo) => photo.takenAt),
  });
  return {
    kind: 'report',
    body,
    signature: await device.sign(body),
    photos: dataUrls,
    takenAt: createdAt,
    checkpointName: report.checkpointName,
  };
}

/** @param {import('../../../shared/types.js').ScanOutcome} outcome */
async function applySessionChanges(outcome) {
  if (outcome.needsEnrollment) await device.forget();
  else if (outcome.needsLogin) device.endShift();
}
