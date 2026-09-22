// @ts-check
/**
 * From tapping a checkpoint to a recorded scan:
 * confirm, then the camera (or the simulator), then the report question.
 */
import { $ } from '../lib/dom.js';
import { server } from '../server/server.js';
import { device } from './device.js';
import { openReport } from './report-screen.js';
import { CheckpointScanner } from './scanner.js';
import { Screen, showResult, showScreen } from './screens.js';
import { buildSimulatedScan } from './simulated-scan.js';
import { submitScan } from './uploads.js';

/** @typedef {import('../types.js').Checkpoint} Checkpoint */

const SIMULATOR_INTRO = 'For testing without a camera. It goes through exactly the same checks as a real scan.';

/** @type {CheckpointScanner} */
let scanner;
/** @type {Checkpoint | null} The checkpoint the guard tapped. */
let chosenCheckpoint = null;
/** @type {() => void} */
let returnHome = () => {};

/** @param {{ onFinished: () => void }} options  Called when the guard leaves the flow without a result screen. */
export function initScanFlow({ onFinished }) {
  returnHome = onFinished;
  scanner = new CheckpointScanner({
    onComplete: handleCapturedScan,
    onUnavailable: (reason) => openSimulator(reason),
    onCancel: onFinished,
  });

  const dialog = $('#scan-confirm');
  $('#scan-confirm-no').addEventListener('click', () => dialog.close());
  $('#scan-confirm-yes').addEventListener('click', () => {
    dialog.close();
    startScan();
  });
  $('#sim-submit').addEventListener('click', submitSimulatedScan);
  $('#sim-back').addEventListener('click', onFinished);
}

/** Ask before opening the camera. @param {Checkpoint} checkpoint */
export function confirmScan(checkpoint) {
  chosenCheckpoint = checkpoint;
  $('#scan-confirm-checkpoint').textContent = checkpoint.name;
  $('#scan-confirm-steps').textContent = requiresAreaPhoto()
    ? 'You will photograph the checkpoint code, then the area around it.'
    : 'You will photograph the checkpoint code.';
  $('#scan-confirm').showModal();
}

function requiresAreaPhoto() {
  return device.state.session?.requireAreaPhoto !== false;
}

function startScan() {
  if (!chosenCheckpoint) return;
  if (device.state.simulateCamera) {
    openSimulator('');
    return;
  }
  scanner.open({ checkpoint: chosenCheckpoint, requireAreaPhoto: requiresAreaPhoto() });
}

/** @param {import('./scanner.js').CapturedScan} captured */
async function handleCapturedScan(captured) {
  if (!captured.position) {
    showResult({
      status: 'Not recorded',
      tone: 'bad',
      title: 'No location',
      message: 'The scan was not saved because location is off or blocked. Allow location and scan again.',
    });
    return;
  }
  const result = await submitScan(
    {
      qr: captured.qr,
      lat: captured.position.lat,
      lng: captured.position.lng,
      accuracy: captured.position.accuracy,
      codeTime: captured.codeTime,
      areaTime: captured.areaTime,
      areaQuality: captured.areaQuality,
      codePhoto: captured.codePhoto,
      areaPhoto: captured.areaPhoto,
    },
    captured.checkpoint.name,
  );
  continueAfterScan(result);
}

/** A recorded or saved scan leads to the report question; a rejected one shows why. @param {import('./uploads.js').ScanResult} result */
function continueAfterScan(result) {
  if (result.kind === 'rejected') {
    showResult({ status: 'Not recorded', tone: 'bad', title: result.checkpointName, message: result.message });
    return;
  }
  openReport(result);
}

/* ------------------------------------------------------------------------
   Simulated scans (prototype only)
   ------------------------------------------------------------------------ */

/** @param {string} note Why the simulator opened, if not by choice. */
function openSimulator(note) {
  if (!chosenCheckpoint) {
    returnHome();
    return;
  }
  $('#sim-checkpoint-name').textContent = chosenCheckpoint.name;
  $('#sim-intro').textContent = [note, SIMULATOR_INTRO].filter(Boolean).join(' ');
  showScreen(Screen.SIMULATE);
}

async function submitSimulatedScan() {
  if (!chosenCheckpoint) return;
  const button = $('#sim-submit');
  button.disabled = true;
  try {
    const scan = buildSimulatedScan({
      checkpoint: chosenCheckpoint,
      guardPostCheckpoint: server.state.checkpoints[0],
      code: $('#sim-code').value,
      location: $('#sim-location').value,
      photos: $('#sim-photos').value,
      lastAreaPhoto: device.lastAreaPhoto,
    });
    continueAfterScan(await submitScan(scan, chosenCheckpoint.name));
  } finally {
    button.disabled = false;
  }
}
