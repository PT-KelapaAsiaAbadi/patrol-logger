// @ts-check
/** The guard app: set up the phone, start a shift, and route between screens. */
import { exportPublicKey, generateDeviceKeys, randomId } from '../lib/crypto.js';
import { $ } from '../lib/dom.js';
import { server } from '../server/server.js';
import { device } from './device.js';
import { renderHome } from './home-screen.js';
import { initReportScreen } from './report-screen.js';
import { confirmScan, initScanFlow } from './scan-flow.js';
import { Screen, showScreen } from './screens.js';
import { uploadQueued } from './uploads.js';

export function initGuardApp() {
  initScanFlow({ onFinished: showGuardApp });
  initReportScreen({ onFinished: showGuardApp });

  $('#enroll-submit').addEventListener('click', enrollThisPhone);
  $('#login-submit').addEventListener('click', startShift);
  $('#login-reset').addEventListener('click', resetThisPhone);
  $('#home-end-shift').addEventListener('click', endShift);
  $('#home-simulate-offline').addEventListener('change', toggleSimulatedSignal);
  $('#home-simulate-camera').addEventListener('change', (/** @type {Event} */ event) => {
    device.state.simulateCamera = /** @type {HTMLInputElement} */ (event.target).checked;
    device.save();
  });
  $('#result-done').addEventListener('click', showGuardApp);
}

/** Show whichever screen fits the phone's state. */
export async function showGuardApp() {
  if (device.hasActiveShift && !device.state.offline) await uploadQueued();

  if (!(await device.isEnrolled())) {
    $('#enroll-hint').textContent = server.state.guards.length
      ? 'Create an enrollment code in Setup, then enter it here.'
      : 'No guards exist yet. Load the demo site or add a guard in Setup first.';
    return showScreen(Screen.ENROLL);
  }
  if (!device.hasActiveShift) {
    $('#login-greeting').textContent = `Hi, ${device.state.name}`;
    $('#login-pin').value = '';
    $('#login-error').textContent = '';
    return showScreen(Screen.LOGIN);
  }
  $('#home-simulate-camera').checked = device.state.simulateCamera;
  await renderHome(confirmScan);
  return showScreen(Screen.HOME);
}

/* ------------------------------------------------------------------------
   Enrollment and shifts
   ------------------------------------------------------------------------ */

async function enrollThisPhone() {
  const error = $('#enroll-error');
  const button = $('#enroll-submit');
  const guardId = $('#enroll-guard-id').value.trim().toUpperCase();
  const code = $('#enroll-code').value.trim();
  const pin = $('#enroll-pin').value;
  const repeatedPin = $('#enroll-pin-repeat').value;

  const problem = validateEnrollment(guardId, code, pin, repeatedPin);
  error.textContent = problem;
  if (problem) return;

  button.disabled = true;
  try {
    const keys = await generateDeviceKeys();
    const response = await server.enroll({ guardId, code, pin, publicKey: await exportPublicKey(keys) });
    if (!response.ok) {
      error.textContent = response.error;
      return;
    }
    await device.enroll(keys, { guardId: response.guardId, name: response.name, role: response.role });
    ['#enroll-guard-id', '#enroll-code', '#enroll-pin', '#enroll-pin-repeat'].forEach((selector) => {
      $(selector).value = '';
    });
    await showGuardApp();
  } catch (failure) {
    error.textContent = `Setup failed: ${/** @type {Error} */ (failure).message}`;
  } finally {
    button.disabled = false;
  }
}

/** @param {string} guardId @param {string} code @param {string} pin @param {string} repeatedPin */
function validateEnrollment(guardId, code, pin, repeatedPin) {
  if (!guardId || !code) return 'Enter your guard ID and enrollment code.';
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4 to 8 digits.';
  if (pin !== repeatedPin) return 'The two PINs do not match.';
  if (!window.crypto?.subtle) return 'This browser cannot create a secure key here. Open the app over HTTPS.';
  return '';
}

async function startShift() {
  const error = $('#login-error');
  const button = $('#login-submit');
  error.textContent = '';
  if (device.state.offline) {
    error.textContent = 'No signal. You need signal to start a shift.';
    return;
  }

  button.disabled = true;
  try {
    const body = JSON.stringify({
      action: 'login',
      guardId: device.state.guardId,
      pin: $('#login-pin').value,
      sentAt: Date.now(),
      nonce: randomId(),
    });
    const response = await server.startShift({ body, signature: await device.sign(body) });
    if (!response.ok) {
      error.textContent = response.error;
      if (response.needsEnrollment) {
        await device.forget();
        setTimeout(showGuardApp, 2500);
      }
      return;
    }
    device.state.session = {
      token: response.sessionToken,
      expiresAt: response.expiresAt,
      requireAreaPhoto: response.requireAreaPhoto,
    };
    device.state.name = response.name;
    device.state.role = response.role;
    device.save();
    await showGuardApp();
  } finally {
    button.disabled = false;
  }
}

async function resetThisPhone() {
  if (!confirm('Remove this phone setup? You will need a new enrollment code.')) return;
  await device.forget();
  await showGuardApp();
}

async function endShift() {
  const waiting = (await device.readQueue()).length;
  const question = waiting
    ? `${waiting} item(s) have not uploaded yet. They upload later only if you start a new shift on this phone. End shift anyway?`
    : 'End your shift on this phone?';
  if (!confirm(question)) return;
  device.endShift();
  await showGuardApp();
}

/** @param {Event} event */
async function toggleSimulatedSignal(event) {
  device.state.offline = /** @type {HTMLInputElement} */ (event.target).checked;
  device.save();
  if (!device.state.offline) await uploadQueued();
  await showGuardApp();
}
