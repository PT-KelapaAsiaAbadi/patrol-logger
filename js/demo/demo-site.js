// @ts-check
/**
 * The demo site: three guards, six checkpoints and one finished night containing
 * every pattern the checks look for. Scans go through the same server checks as real ones.
 */
import { refreshCurrentView } from '../app/navigation.js';
import { createSyntheticPhoto } from '../domain/synthetic-photo.js';
import { randomId } from '../lib/crypto.js';
import { offsetPosition } from '../lib/geo.js';
import { keyValueStore } from '../lib/storage.js';
import { device } from '../guard/device.js';
import { server } from '../server/server.js';

const SITE_ORIGIN = { lat: -7.2575, lng: 112.7521 };
const GUARD_POST = offsetPosition(SITE_ORIGIN, 3, 2);
const OLD_CODE = 'GP1|CP03|kOLDCOPY';
const CHECKPOINT_RADIUS_M = 40;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Name and position in metres north and east of the site origin. Tokens are fixed so codes match on every device. */
const CHECKPOINTS = [
  ['Main gate', 0, 0],
  ['Warehouse door', 60, 40],
  ['Back fence', 140, -30],
  ['Generator room', 90, -80],
  ['Parking lot', -40, -70],
  ['Office entrance', 20, -20],
];

const GUARDS = [
  { id: 'G01', name: 'Budi Santoso', role: 'guard' },
  { id: 'G02', name: 'Sari Wulandari', role: 'guard' },
  { id: 'S01', name: 'Rahmat Hidayat', role: 'supervisor' },
];

/**
 * @typedef {object} PlannedScan
 * @property {string} guardId
 * @property {number} checkpoint       1-based checkpoint number
 * @property {number} time
 * @property {import('../types.js').Position} [at]   Where the phone really was, if not at the checkpoint.
 * @property {string} [areaPhoto]     Reuse this exact photo.
 * @property {string} [qr]            Scan this code instead of the real one.
 * @property {number} [uploadDelayMin]
 * @property {{ text: string, photoCount: number, photoAgeMin?: number }} [report]  A report sent after the scan.
 */

export async function seedDemoSite() {
  const hasData = server.state.log.length > 0 || device.state.guardId;
  if (
    hasData &&
    !confirm(
      'Replace all prototype data in this browser with the demo site? Any phone set up here must be set up again.',
    )
  )
    return;

  await resetEverything();
  const state = server.state;
  state.checkpoints = CHECKPOINTS.map(([name, north, east], index) => ({
    id: `CP0${index + 1}`,
    name: /** @type {string} */ (name),
    ...offsetPosition(SITE_ORIGIN, /** @type {number} */ (north), /** @type {number} */ (east)),
    radius: CHECKPOINT_RADIUS_M,
    token: `kdemo${index + 1}x7`,
    version: 1,
    active: true,
  }));
  state.guards = GUARDS.map((guard) => ({
    ...guard,
    role: /** @type {'guard' | 'supervisor'} */ (guard.role),
    active: true,
    failedPins: 0,
    device: null,
    session: null,
    enrollment: null,
  }));

  const nightStart = lastFinishedNightStart();
  await recordPlannedScans(planNight(nightStart));
  server.save();
  await refreshCurrentView();
}

/** Clear the server, stored photos and this phone's setup. */
export async function resetEverything() {
  server.reset();
  await keyValueStore.clear();
  await device.forget();
}

/** 22:00 on the most recent night that has fully finished. */
function lastFinishedNightStart() {
  const today = new Date();
  today.setHours(22, 0, 0, 0);
  let start = today.getTime();
  while (start + 8 * HOUR_MS > Date.now()) start -= 24 * HOUR_MS;
  return start;
}

/**
 * @param {number} nightStart
 * @returns {PlannedScan[]}
 */
function planNight(nightStart) {
  /** Clock time on this night; hours before noon belong to the next morning. @param {number} hour @param {number} minute */
  const at = (hour, minute) => nightStart + ((hour < 12 ? hour + 24 : hour) - 22) * HOUR_MS + minute * MINUTE_MS;
  const reusedGeneratorPhoto = createSyntheticPhoto({ title: 'Area photo', subtitle: 'Generator room', hue: 150 });
  /** @type {PlannedScan[]} */
  const plan = [];
  /** @param {string} guardId @param {number} checkpoint @param {number} time @param {Partial<PlannedScan>} [details] */
  const scan = (guardId, checkpoint, time, details = {}) => plan.push({ guardId, checkpoint, time, ...details });

  // 22:00 round: Budi, a normal round. The Generator room photo is reused later.
  scan('G01', 1, at(22, 8));
  scan('G01', 6, at(22, 14));
  scan('G01', 5, at(22, 20));
  scan('G01', 4, at(22, 27), { areaPhoto: reusedGeneratorPhoto });
  scan('G01', 3, at(22, 34));
  scan('G01', 2, at(22, 41));

  // 00:00 round: Budi scans all six in five minutes.
  [1, 6, 5, 4, 3, 2].forEach((checkpoint, index) => scan('G01', checkpoint, at(0, 12 + index)));

  // Supervisor spot check.
  scan('S01', 4, at(1, 5));

  // 02:00 round: Budi stays at the guard post, reuses a photo and tries an old code. Back fence and Parking lot are missed.
  scan('G01', 1, at(2, 20));
  scan('G01', 6, at(2, 26));
  scan('G01', 4, at(2, 31), {
    at: GUARD_POST,
    areaPhoto: reusedGeneratorPhoto,
    report: { text: 'Generator fuel low.', photoCount: 1, photoAgeMin: 300 },
  });
  scan('G01', 2, at(2, 37), { at: GUARD_POST });
  scan('G01', 3, at(3, 10), { at: GUARD_POST, qr: OLD_CODE });

  /** One of Sari's scans uploads late; at the Back fence she reports a problem. @param {number} checkpoint */
  const sariDetails = (checkpoint) => {
    if (checkpoint === 5) return { uploadDelayMin: 25 };
    if (checkpoint === 3) {
      return { report: { text: 'Padlock on the back gate is broken. I closed it with wire for now.', photoCount: 2 } };
    }
    return {};
  };

  // 04:00 round: Sari patrols; Budi's phone scans beside her twice; one of Sari's scans uploads late.
  [
    [1, 5],
    [6, 11],
    [5, 18],
    [4, 25],
    [3, 33],
    [2, 41],
  ].forEach(([checkpoint, minute]) => scan('G02', checkpoint, at(4, minute), sariDetails(checkpoint)));
  scan('G01', 1, at(4, 5) + 30_000);
  scan('G01', 6, at(4, 11) + 40_000);

  return plan;
}

/** Feed the plan to the server in the order the uploads would have arrived. @param {PlannedScan[]} plan */
async function recordPlannedScans(plan) {
  const arrival = (/** @type {PlannedScan} */ p) => p.time + (p.uploadDelayMin ?? 0) * MINUTE_MS;
  for (const planned of [...plan].sort((a, b) => arrival(a) - arrival(b))) {
    const guard = /** @type {import('../types.js').Guard} */ (server.findGuard(planned.guardId));
    const checkpoint = server.state.checkpoints[planned.checkpoint - 1];
    const checkpointPosition = /** @type {import('../types.js').Position} */ (checkpoint); // demo checkpoints always have one
    const position = planned.at ?? offsetPosition(checkpointPosition, Math.random() * 8 - 4, Math.random() * 8 - 4);
    const scan = {
      scanId: randomId(),
      qr: planned.qr ?? `GP1|${checkpoint.id}|${checkpoint.token}`,
      lat: position.lat,
      lng: position.lng,
      accuracy: 6 + Math.round(Math.random() * 12),
      codeTime: new Date(planned.time).toISOString(),
      areaTime: new Date(planned.time + 25_000).toISOString(),
      areaQuality: /** @type {'ok'} */ ('ok'),
    };
    const photos = {
      code: createSyntheticPhoto({ title: 'Code photo', subtitle: checkpoint.name, hue: 40 }),
      area:
        planned.areaPhoto ??
        createSyntheticPhoto({ title: 'Area photo', subtitle: checkpoint.name, hue: 150 + planned.checkpoint * 25 }),
    };
    await server.recordScan(guard, scan, photos, arrival(planned) + 2000);
    if (planned.report) await recordPlannedReport(guard, scan.scanId, checkpoint.name, planned, arrival(planned));
  }
}

/**
 * @param {import('../types.js').Guard} guard
 * @param {string} scanId
 * @param {string} checkpointName
 * @param {PlannedScan} planned
 * @param {number} arrivedAt
 */
async function recordPlannedReport(guard, scanId, checkpointName, planned, arrivedAt) {
  const report = /** @type {NonNullable<PlannedScan['report']>} */ (planned.report);
  const createdAt = planned.time + 90_000;
  const photos = Array.from({ length: report.photoCount }, (_, index) =>
    createSyntheticPhoto({ title: `Report photo ${index + 1}`, subtitle: checkpointName, hue: 20 }),
  );
  const takenAt = createdAt - (report.photoAgeMin ?? 1) * MINUTE_MS;
  await server.recordReport(
    guard,
    { reportId: randomId(), scanId, text: report.text, createdAt, photoTimes: photos.map(() => takenAt) },
    photos,
    arrivedAt + 92_000,
  );
}
