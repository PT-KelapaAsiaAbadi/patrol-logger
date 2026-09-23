// @ts-check
/**
 * The demo site: three guards, six checkpoints and one finished night containing
 * every pattern the checks look for. Scans go through the same server checks as real ones.
 */
import { createSyntheticPhoto } from './synthetic-photo.js';
import { STORAGE_KEYS } from '../shared/config.js';
import { randomId } from '../shared/lib/crypto.js';
import { offsetPosition } from '../shared/lib/geo.js';
import { keyValueStore, localStore } from '../shared/lib/storage.js';
import { server } from './mock-backend/server.js';

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
 * @property {import('../shared/types.js').Position} [at]   Where the phone really was, if not at the checkpoint.
 * @property {string} [qr]            Scan this code instead of the real one.
 * @property {number} [uploadDelayMin]
 * @property {DemoReport} [report]    A report sent after the scan.
 *
 * @typedef {object} DemoReport
 * @property {string} text
 * @property {number} [photoCount]    New photos to attach. Ignored when `photos` is given.
 * @property {string[]} [photos]      Exact photos, so one can be sent twice.
 * @property {number} [photoAgeMin]   How long before the report the photos were taken.
 */

/** Seeds the demo site. The caller re-renders: this module knows nothing about either app. */
export async function seedDemoSite() {
  const hasData = server.state.log.length > 0 || Boolean(localStore.read(STORAGE_KEYS.device, null));
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
}

/**
 * Clear the server, stored report photos and any phone set up in this browser.
 * The phone's keys are cleared through storage rather than the guard app's device
 * module, so the demo seeder stays independent of both apps.
 */
export async function resetEverything() {
  server.reset();
  await keyValueStore.clear();
  localStore.remove(STORAGE_KEYS.device);
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
  // Budi sends the same photo with two reports, hours apart.
  const generatorPhoto = createSyntheticPhoto({ title: 'Generator room', subtitle: 'Fuel gauge', hue: 20 });
  /** @type {PlannedScan[]} */
  const plan = [];
  /** @param {string} guardId @param {number} checkpoint @param {number} time @param {Partial<PlannedScan>} [details] */
  const scan = (guardId, checkpoint, time, details = {}) => plan.push({ guardId, checkpoint, time, ...details });

  // 22:00 round: Budi, a normal round. He photographs the generator gauge and reuses that photo later.
  scan('G01', 1, at(22, 8));
  scan('G01', 6, at(22, 14));
  scan('G01', 5, at(22, 20));
  scan('G01', 4, at(22, 27), {
    report: { text: 'Generator fuel gauge is low, about a quarter.', photos: [generatorPhoto] },
  });
  scan('G01', 3, at(22, 34));
  scan('G01', 2, at(22, 41));

  // 00:00 round: Budi scans all six in five minutes.
  [1, 6, 5, 4, 3, 2].forEach((checkpoint, index) => scan('G01', checkpoint, at(0, 12 + index)));

  // Supervisor spot check.
  scan('S01', 4, at(1, 5));

  // 02:00 round: Budi stays at the guard post, sends the earlier photo again and tries an old code.
  // Back fence and Parking lot are missed.
  scan('G01', 1, at(2, 20));
  scan('G01', 6, at(2, 26));
  scan('G01', 4, at(2, 31), {
    at: GUARD_POST,
    report: { text: 'Generator fuel still low.', photos: [generatorPhoto], photoAgeMin: 300 },
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
    const guard = /** @type {import('../shared/types.js').Guard} */ (server.findGuard(planned.guardId));
    const checkpoint = server.state.checkpoints[planned.checkpoint - 1];
    const checkpointPosition = /** @type {import('../shared/types.js').Position} */ (checkpoint); // demo checkpoints always have one
    const position = planned.at ?? offsetPosition(checkpointPosition, Math.random() * 8 - 4, Math.random() * 8 - 4);
    const scan = {
      scanId: randomId(),
      qr: planned.qr ?? `GP1|${checkpoint.id}|${checkpoint.token}`,
      lat: position.lat,
      lng: position.lng,
      accuracy: 6 + Math.round(Math.random() * 12),
      takenAt: new Date(planned.time).toISOString(),
    };
    await server.recordScan(guard, scan, arrival(planned) + 2000);
    if (planned.report) await recordPlannedReport(guard, scan.scanId, checkpoint.name, planned, arrival(planned));
  }
}

/**
 * @param {import('../shared/types.js').Guard} guard
 * @param {string} scanId
 * @param {string} checkpointName
 * @param {PlannedScan} planned
 * @param {number} arrivedAt
 */
async function recordPlannedReport(guard, scanId, checkpointName, planned, arrivedAt) {
  const report = /** @type {DemoReport} */ (planned.report);
  const createdAt = planned.time + 90_000;
  const photos =
    report.photos ??
    Array.from({ length: report.photoCount ?? 0 }, (_, index) =>
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
