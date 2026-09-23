// @ts-check
/** The shift's home screen: the guard's checkpoints for the current round, and recent activity. */
import { findWindowAt, getNightSchedule, nightKeyFor } from '../../../shared/domain/rounds.js';
import { $, el } from '../../../shared/lib/dom.js';
import { formatClock } from '../../../shared/lib/format.js';
import { server } from './api.js';
import { device } from './device.js';

/** @typedef {import('../../../shared/types.js').Checkpoint} Checkpoint */
/** @typedef {import('../../../shared/types.js').LogEntry} LogEntry */

const HISTORY_LIMIT = 20;

/**
 * @param {(checkpoint: Checkpoint) => void} onChooseCheckpoint  Called when the guard taps a checkpoint.
 */
export async function renderHome(onChooseCheckpoint) {
  const state = device.state;
  const session = /** @type {import('./device.js').DeviceSession} */ (state.session);
  const waiting = await device.readQueue();

  $('#home-name').textContent = state.name;
  $('#home-shift').textContent = `Shift login valid until ${formatClock(session.expiresAt)}`;
  $('#home-simulate-offline').checked = state.offline;
  $('#home-connection').textContent = state.offline ? 'No signal' : 'Online';
  $('#home-queue-count').textContent = String(waiting.length);

  const now = Date.now();
  const schedule = getNightSchedule(nightKeyFor(now), server.state.rounds);
  renderCheckpoints(schedule, now, onChooseCheckpoint);
  renderHistory(schedule, waiting);
}

/**
 * @param {import('../../../shared/domain/rounds.js').NightSchedule} schedule
 * @param {number} now
 * @param {(checkpoint: Checkpoint) => void} onChooseCheckpoint
 */
function renderCheckpoints(schedule, now, onChooseCheckpoint) {
  const guard = server.findGuard(/** @type {string} */ (device.state.guardId));
  const checkpoints = guard ? server.assignedCheckpoints(guard) : [];
  const round = findWindowAt(schedule, now);

  $('#home-round-title').textContent = round
    ? `Current round, ${formatClock(round.from)} to ${formatClock(round.to)}`
    : now < schedule.start
      ? `Your checkpoints. Rounds start at ${formatClock(schedule.start)}`
      : 'Your checkpoints. No round scheduled now';
  $('#home-round-hint').textContent = checkpoints.length
    ? 'Tap a checkpoint when you reach it.'
    : 'You have no checkpoints assigned. Ask your supervisor.';

  $('#home-checkpoints').replaceChildren(
    ...checkpoints.map((checkpoint) => {
      const status = roundStatus(checkpoint, round);
      return el(
        'li',
        null,
        el(
          'button',
          { class: 'checkpoint-button', onclick: () => onChooseCheckpoint(checkpoint) },
          el('span', { text: checkpoint.name }),
          el('span', { class: `checkpoint-status ${status.tone}`, text: status.text }),
        ),
      );
    }),
  );
}

/**
 * @param {Checkpoint} checkpoint
 * @param {{ from: number, to: number } | null} round
 */
function roundStatus(checkpoint, round) {
  if (!round) return { text: 'Tap to scan', tone: 'tone-quiet' };
  const scan = server.state.log.find(
    (entry) =>
      entry.result === 'ACCEPTED' &&
      entry.checkpointId === checkpoint.id &&
      entry.time >= round.from &&
      entry.time < round.to,
  );
  if (!scan) return { text: 'Not yet', tone: 'tone-warn' };
  if (scan.guardId === device.state.guardId) return { text: `Done ${formatClock(scan.time)}`, tone: 'tone-ok' };
  return { text: `Done by ${scan.guardName.split(' ')[0]}`, tone: 'tone-ok' };
}

/**
 * @param {import('../../../shared/domain/rounds.js').NightSchedule} schedule
 * @param {import('./device.js').QueuedUpload[]} waiting
 */
function renderHistory(schedule, waiting) {
  const guardId = device.state.guardId;
  const inThisNight = (/** @type {number} */ time) => time >= schedule.dayFrom && time < schedule.dayTo;

  const items = [
    ...waiting.map((upload) => ({
      time: upload.takenAt,
      name: upload.checkpointName,
      label: 'Waiting to upload',
      tone: 'tone-warn',
    })),
    ...server.state.log.filter((entry) => entry.guardId === guardId && inThisNight(entry.time)).map(describeScan),
    ...server.state.reports
      .filter((report) => report.guardId === guardId && inThisNight(report.time))
      .map((report) => ({ time: report.time, name: report.checkpointName, label: 'Report sent', tone: 'tone-ok' })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, HISTORY_LIMIT);

  $('#home-history').replaceChildren(
    ...items.map((item) =>
      el(
        'li',
        null,
        el('span', null, el('span', { class: 'time', text: `${formatClock(item.time)}  ` }), item.name),
        el('span', { class: item.tone, text: item.label }),
      ),
    ),
  );
  $('#home-history-empty').hidden = items.length > 0;
}

/** @param {LogEntry} entry */
function describeScan(entry) {
  const name = entry.checkpointName || 'Unknown code';
  if (entry.result === 'REJECTED') return { time: entry.time, name, label: 'Not recorded', tone: 'tone-bad' };
  if (entry.flags.length) return { time: entry.time, name, label: 'To be reviewed', tone: 'tone-warn' };
  return { time: entry.time, name, label: 'Recorded', tone: 'tone-ok' };
}
