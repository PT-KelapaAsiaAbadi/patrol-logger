// @ts-check
/** Setup: guards, checkpoints, rounds, scan rules, printable codes, and demo tools. */
import { refreshCurrentView } from '../app/navigation.js';
import { ROUNDS } from '../config.js';
import { resetEverything, seedDemoSite } from '../demo/demo-site.js';
import { shortestRoundMinutes } from '../domain/rounds.js';
import { randomToken } from '../lib/crypto.js';
import { $, el } from '../lib/dom.js';
import { formatClock, formatDuration, pad2 } from '../lib/format.js';
import { hasPosition, offsetPosition } from '../lib/geo.js';
import { server } from '../server/server.js';
import { QR_PREFIX } from '../config.js';

/** @typedef {import('../types.js').Guard} Guard */
/** @typedef {import('../types.js').Checkpoint} Checkpoint */

let statusMessage = '';

/** Show a message at the top of Setup, kept across re-renders. @param {string} message */
export function announce(message) {
  statusMessage = message;
  const line = $('#setup-status');
  if (line) line.textContent = message;
}

function saveAndRender() {
  server.save();
  renderSetup();
}

export function renderSetup() {
  $('#setup-content').replaceChildren(
    el('h1', { text: 'Setup' }),
    el('p', { class: 'status-line', id: 'setup-status', 'aria-live': 'polite', text: statusMessage }),
    ...guardsSection(),
    ...checkpointsSection(),
    ...assignmentsSection(),
    ...roundsSection(),
    ...scanRulesSection(),
    codeSheetSection(),
    ...demoSection(),
  );
}

/* ------------------------------------------------------------------------
   Guards
   ------------------------------------------------------------------------ */

function guardsSection() {
  const guards = server.state.guards;
  const table = guards.length
    ? tableOf(['ID', 'Name', 'Role', 'Status', 'Phone', 'Enrollment code', ''], guards.map(guardRow))
    : el('p', { class: 'muted', text: 'No guards yet.' });

  const idInput = el('input', { id: 'new-guard-id', placeholder: 'G04', size: 6 });
  const nameInput = el('input', { id: 'new-guard-name', placeholder: 'Full name' });
  const roleSelect = el(
    'select',
    { id: 'new-guard-role' },
    el('option', { value: 'guard', text: 'Guard' }),
    el('option', { value: 'supervisor', text: 'Supervisor' }),
  );

  const addGuard = () => {
    const id = idInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();
    if (!id || !name) return announce('Enter a guard ID and a name.');
    if (server.findGuard(id)) return announce(`Guard ID ${id} already exists.`);
    guards.push({
      id,
      name,
      role: roleSelect.value,
      active: true,
      failedPins: 0,
      device: null,
      session: null,
      enrollment: null,
    });
    announce(`Added ${name}.`);
    saveAndRender();
  };

  return [
    el('h2', { text: 'Guards' }),
    table,
    el(
      'div',
      { class: 'form-row' },
      field('new-guard-id', 'Guard ID', idInput),
      field('new-guard-name', 'Name', nameInput),
      field('new-guard-role', 'Role', roleSelect),
      el('button', { class: 'button button--primary', text: 'Add guard', onclick: addGuard }),
    ),
  ];
}

/** @param {Guard} guard */
function guardRow(guard) {
  const locked = guard.failedPins >= 5;
  const enrollment = guard.enrollment && Date.now() < guard.enrollment.expiresAt ? guard.enrollment : null;
  const status = !guard.active
    ? ['Inactive', 'status-quiet']
    : locked
      ? ['Locked, wrong PINs', 'status-problem']
      : ['Active', ''];

  return el(
    'tr',
    null,
    el('td', { text: guard.id }),
    el('td', { text: guard.name }),
    el('td', { text: guard.role === 'supervisor' ? 'Supervisor' : 'Guard' }),
    el('td', { class: status[1], text: status[0] }),
    el('td', {
      text: guard.device ? `Set up ${new Date(guard.device.enrolledAt).toLocaleDateString()}` : 'Not set up',
    }),
    el('td', { text: enrollment ? `${enrollment.code}, valid until ${formatClock(enrollment.expiresAt)}` : '' }),
    el('td', null, el('div', { class: 'button-group' }, guardActions(guard, locked))),
  );
}

/** @param {Guard} guard @param {boolean} locked */
function guardActions(guard, locked) {
  const actions = [];
  if (guard.active) {
    actions.push(
      smallButton('Create enrollment code', () => {
        const { code } = server.issueEnrollmentCode(guard);
        announce(
          `Enrollment code for ${guard.name}: ${code}. Give it to them in person. Using it replaces any phone set up before.`,
        );
        renderSetup();
      }),
    );
  }
  if (locked) {
    actions.push(
      smallButton('Unlock', () => {
        guard.failedPins = 0;
        announce(`${guard.name} is unlocked.`);
        saveAndRender();
      }),
    );
  }
  if (guard.device) {
    actions.push(
      smallButton('Remove phone', () => {
        guard.device = null;
        guard.session = null;
        announce(`${guard.name}'s phone was removed. They need a new enrollment code.`);
        saveAndRender();
      }),
    );
  }
  actions.push(
    smallButton(guard.active ? 'Deactivate' : 'Activate', () => {
      guard.active = !guard.active;
      if (!guard.active) guard.session = null;
      saveAndRender();
    }),
  );
  return actions;
}

/* ------------------------------------------------------------------------
   Checkpoints
   ------------------------------------------------------------------------ */

function checkpointsSection() {
  const { checkpoints, config } = server.state;
  const table = checkpoints.length
    ? tableOf(
        ['ID', 'Name', 'Location', 'Allowed distance', 'Printed code', 'Status', ''],
        checkpoints.map(checkpointRow),
      )
    : el('p', { class: 'muted', text: 'No checkpoints yet.' });

  const nameInput = el('input', { id: 'new-checkpoint-name', placeholder: 'e.g. Loading dock' });
  const radiusInput = el('input', {
    id: 'new-checkpoint-radius',
    type: 'number',
    min: 10,
    max: 500,
    value: config.defaultRadiusM,
    size: 5,
  });

  const addCheckpoint = () => {
    const name = nameInput.value.trim();
    if (!name) return announce('Enter a checkpoint name.');
    checkpoints.push({
      id: nextCheckpointId(),
      name,
      lat: null,
      lng: null,
      radius: Number(radiusInput.value) || config.defaultRadiusM,
      token: randomToken(12),
      version: 1,
      active: true,
    });
    announce(`Added ${name}. Print its code below.`);
    saveAndRender();
  };

  return [
    el('h2', { text: 'Checkpoints' }),
    el('p', {
      class: 'muted',
      text: 'A checkpoint without a location is set by the first supervisor scan there with GPS accurate to 30 m or better.',
    }),
    table,
    el(
      'div',
      { class: 'form-row' },
      field('new-checkpoint-name', 'Checkpoint name', nameInput),
      field('new-checkpoint-radius', 'Allowed distance (m)', radiusInput),
      el('button', { class: 'button button--primary', text: 'Add checkpoint', onclick: addCheckpoint }),
    ),
  ];
}

function nextCheckpointId() {
  let number = server.state.checkpoints.length + 1;
  while (server.findCheckpoint(`CP${pad2(number)}`)) number++;
  return `CP${pad2(number)}`;
}

/** @param {Checkpoint} checkpoint */
function checkpointRow(checkpoint) {
  const located = hasPosition(checkpoint);
  return el(
    'tr',
    null,
    el('td', { text: checkpoint.id }),
    el('td', { text: checkpoint.name }),
    el('td', {
      class: located ? '' : 'status-due',
      text: located ? `${checkpoint.lat?.toFixed(5)}, ${checkpoint.lng?.toFixed(5)}` : 'Not set',
    }),
    el('td', { text: `${checkpoint.radius || server.state.config.defaultRadiusM} m` }),
    el('td', { text: `Version ${checkpoint.version}` }),
    el('td', { text: checkpoint.active ? 'Active' : 'Inactive' }),
    el(
      'td',
      null,
      el(
        'div',
        { class: 'button-group' },
        smallButton('Set to my location', () => setCheckpointToMyLocation(checkpoint)),
        smallButton('Replace code', () => {
          server.replaceCheckpointCode(checkpoint);
          announce(`${checkpoint.name} has a new code. The old printed code no longer works; print and replace it.`);
          renderSetup();
        }),
        smallButton(checkpoint.active ? 'Deactivate' : 'Activate', () => {
          checkpoint.active = !checkpoint.active;
          saveAndRender();
        }),
      ),
    ),
  );
}

/** @param {Checkpoint} checkpoint */
async function setCheckpointToMyLocation(checkpoint) {
  announce('Getting your location…');
  try {
    const position = await currentPosition();
    checkpoint.lat = position.latitude;
    checkpoint.lng = position.longitude;
    announce(`${checkpoint.name} set to your location (within ${Math.round(position.accuracy)} m).`);
    saveAndRender();
  } catch (error) {
    announce(/** @type {Error} */ (error).message);
  }
}

/** @returns {Promise<GeolocationCoordinates>} */
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser has no location support.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (error) =>
        reject(
          new Error(
            error.code === error.PERMISSION_DENIED ? 'Location is blocked for this page.' : 'Could not get a location.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/* ------------------------------------------------------------------------
   Assignments: which checkpoints each guard sees on their phone
   ------------------------------------------------------------------------ */

function assignmentsSection() {
  const { guards } = server.state;
  const checkpoints = server.state.checkpoints.filter((checkpoint) => checkpoint.active);
  if (!guards.length || !checkpoints.length) return [];

  /** @type {Map<string, HTMLInputElement[]>} */
  const boxesByGuard = new Map();
  const rows = guards.map((guard) => {
    const assigned = new Set(server.assignedCheckpoints(guard).map((checkpoint) => checkpoint.id));
    const boxes = checkpoints.map((checkpoint) =>
      el('input', {
        type: 'checkbox',
        'data-checkpoint': checkpoint.id,
        checked: assigned.has(checkpoint.id),
        'aria-label': `${guard.name} patrols ${checkpoint.name}`,
      }),
    );
    boxesByGuard.set(guard.id, boxes);
    return el(
      'tr',
      null,
      el('td', { text: guard.name }),
      boxes.map((box) => el('td', null, box)),
    );
  });

  const saveAssignments = () => {
    for (const guard of guards) {
      const checked = (boxesByGuard.get(guard.id) ?? [])
        .filter((box) => box.checked)
        .map((box) => String(box.dataset.checkpoint));
      guard.assignedCheckpointIds = checked.length === checkpoints.length ? null : checked;
    }
    announce('Assignments saved. Guards see the change the next time their home screen loads.');
    saveAndRender();
  };

  return [
    el('h2', { text: 'Assignments' }),
    el('p', {
      class: 'muted',
      text: 'Guards only see the checkpoints ticked for them. A guard with every checkpoint ticked also gets new checkpoints automatically.',
    }),
    tableOf(['Guard', ...checkpoints.map((checkpoint) => checkpoint.name)], rows),
    el(
      'div',
      { class: 'form-row' },
      el('button', { class: 'button button--primary', text: 'Save assignments', onclick: saveAssignments }),
    ),
  ];
}

/* ------------------------------------------------------------------------
   Rounds and scan rules
   ------------------------------------------------------------------------ */

function roundsSection() {
  const rounds = server.state.rounds;
  const startInput = el('input', { id: 'rounds-start', type: 'time', value: rounds.start });
  const endInput = el('input', { id: 'rounds-end', type: 'time', value: rounds.end });
  const intervalSelect = el(
    'select',
    { id: 'rounds-interval' },
    ROUNDS.intervalChoices.map((minutes) =>
      el('option', { value: minutes, text: formatDuration(minutes), selected: rounds.everyMinutes === minutes }),
    ),
  );
  const shortest = shortestRoundMinutes(server.state.checkpoints.filter((checkpoint) => checkpoint.active));

  const saveRounds = () => {
    server.state.rounds = {
      start: startInput.value || ROUNDS.defaults.start,
      end: endInput.value || ROUNDS.defaults.end,
      everyMinutes: Number(intervalSelect.value),
    };
    announce('Rounds saved.');
    saveAndRender();
  };

  return [
    el('h2', { text: 'Rounds' }),
    el('p', {
      class: 'muted',
      text: `Every active checkpoint must be scanned once per round. Shortest realistic round for the current checkpoints: ${shortest === null ? 'unknown until checkpoints have locations' : formatDuration(shortest)}.`,
    }),
    el(
      'div',
      { class: 'form-row' },
      field('rounds-start', 'Patrols start', startInput),
      field('rounds-end', 'Patrols end', endInput),
      field('rounds-interval', 'One round every', intervalSelect),
      el('button', { class: 'button button--primary', text: 'Save rounds', onclick: saveRounds }),
    ),
  ];
}

function scanRulesSection() {
  const config = server.state.config;
  const areaPhoto = el('input', { type: 'checkbox', id: 'rule-area-photo', checked: config.requireAreaPhoto });
  const rejectFar = el('input', { type: 'checkbox', id: 'rule-reject-far', checked: config.rejectClearlyOutOfRange });

  const saveRules = () => {
    config.requireAreaPhoto = areaPhoto.checked;
    config.rejectClearlyOutOfRange = rejectFar.checked;
    announce('Scan rules saved. Guards pick up the photo setting when they next start a shift.');
    saveAndRender();
  };

  return [
    el('h2', { text: 'Scan rules' }),
    el(
      'label',
      { class: 'check', for: 'rule-area-photo' },
      areaPhoto,
      'Require a second photo of the area around the checkpoint',
    ),
    el(
      'label',
      { class: 'check', for: 'rule-reject-far' },
      rejectFar,
      'Reject scans that are clearly outside the checkpoint area (GPS accurate to 30 m or better). Otherwise they are recorded and flagged.',
    ),
    el(
      'div',
      { class: 'form-row' },
      el('button', { class: 'button button--primary', text: 'Save scan rules', onclick: saveRules }),
    ),
  ];
}

/* ------------------------------------------------------------------------
   Printable codes
   ------------------------------------------------------------------------ */

function codeSheetSection() {
  const checkpoints = server.state.checkpoints.filter((checkpoint) => checkpoint.active);
  const printCodes = () => {
    document.body.classList.add('is-printing-codes');
    window.print();
    setTimeout(() => document.body.classList.remove('is-printing-codes'), 500);
  };

  return el(
    'section',
    { id: 'code-sheet-section' },
    el('h2', { text: 'Printable checkpoint codes' }),
    el('p', {
      class: 'muted',
      text: 'Print, laminate and mount these. The demo site uses the same codes on every device, so you can show them on a laptop and scan them with a phone that has also loaded the demo site. Checkpoints you add yourself only exist in this browser.',
    }),
    el('div', { class: 'form-row' }, el('button', { class: 'button', text: 'Print codes', onclick: printCodes })),
    checkpoints.length
      ? el('div', { class: 'code-sheet' }, checkpoints.map(codeCard))
      : el('p', { class: 'muted', text: 'Add checkpoints first.' }),
  );
}

/** @param {Checkpoint} checkpoint */
function codeCard(checkpoint) {
  const card = el('div', { class: 'code-card' });
  const qrcode = /** @type {any} */ (window).qrcode;
  if (qrcode) {
    const code = qrcode(0, 'Q');
    code.addData(`${QR_PREFIX}|${checkpoint.id}|${checkpoint.token}`);
    code.make();
    const holder = el('div');
    holder.innerHTML = code.createSvgTag(5, 4); // generated by the library from our own data
    card.append(holder);
  } else {
    card.append(el('p', { class: 'muted', text: 'The QR library did not load.' }));
  }
  card.append(
    el('strong', { text: checkpoint.name }),
    el('span', { text: `${checkpoint.id}, version ${checkpoint.version}` }),
  );
  return card;
}

/* ------------------------------------------------------------------------
   Demo and testing
   ------------------------------------------------------------------------ */

function demoSection() {
  const moveCheckpointsAroundMe = async () => {
    announce('Getting your location…');
    try {
      const position = await currentPosition();
      const here = { lat: position.latitude, lng: position.longitude };
      const checkpoints = server.state.checkpoints;
      checkpoints.forEach((checkpoint, index) => {
        const angle = (index / checkpoints.length) * 2 * Math.PI;
        const distance = 25 + index * 8;
        Object.assign(checkpoint, offsetPosition(here, Math.cos(angle) * distance, Math.sin(angle) * distance));
      });
      announce('Checkpoints moved to within about 70 m of you, so real scans here pass the distance check.');
      saveAndRender();
    } catch (error) {
      announce(/** @type {Error} */ (error).message);
    }
  };

  const tamper = () => {
    const changed = server.tamperWithLogForTesting();
    announce(
      changed
        ? 'Changed the time of one entry by 15 minutes. Run "Check the log" on the dashboard to see it detected.'
        : 'The log is empty.',
    );
  };

  const deleteEverything = async () => {
    if (!confirm('Delete all prototype data in this browser, including any phone setup?')) return;
    await resetEverything();
    announce('Everything was deleted.');
    await refreshCurrentView();
  };

  return [
    el('h2', { text: 'Demo and testing' }),
    el('p', {
      class: 'muted',
      text: 'The demo site has three guards, six checkpoints and a recorded night that includes a rushed round, missed checkpoints, scans from the guard post, a reused photo, an old code, one person carrying two phones and a late upload.',
    }),
    el(
      'div',
      { class: 'form-row' },
      el('button', { class: 'button button--primary', text: 'Load the demo site', onclick: seedDemoSite }),
      el('button', { class: 'button', text: 'Move checkpoints around me', onclick: moveCheckpointsAroundMe }),
      el('button', { class: 'button', text: 'Edit a log entry to test tamper detection', onclick: tamper }),
      el('button', { class: 'button button--danger', text: 'Delete everything', onclick: deleteEverything }),
    ),
  ];
}

/* ------------------------------------------------------------------------
   Small builders
   ------------------------------------------------------------------------ */

/** @param {string} text @param {() => void} onClick */
function smallButton(text, onClick) {
  return el('button', { class: 'button button--small', text, onclick: onClick });
}

/** @param {string} id @param {string} label @param {HTMLElement} control */
function field(id, label, control) {
  return el('div', { class: 'form-field' }, el('label', { for: id, text: label }), control);
}

/** @param {string[]} headings @param {HTMLElement[]} rows */
function tableOf(headings, rows) {
  return el(
    'div',
    { class: 'table-scroll' },
    el(
      'table',
      null,
      el(
        'thead',
        null,
        el(
          'tr',
          null,
          headings.map((heading) => el('th', { text: heading })),
        ),
      ),
      el('tbody', null, rows),
    ),
  );
}
