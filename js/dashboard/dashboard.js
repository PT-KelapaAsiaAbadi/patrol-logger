// @ts-check
/** Supervisor dashboard: rounds, each guard's night, scans to review, and the log check. */
import { showView } from '../app/navigation.js';
import { seedDemoSite } from '../demo/demo-site.js';
import { hasOnlyMinorFlags, needsReview } from '../domain/flags.js';
import {
  CheckpointStatus,
  RoundResult,
  checkpointStatus,
  getNightSchedule,
  nightKeyFor,
  shortestRoundMinutes,
  summarizeRound,
} from '../domain/rounds.js';
import { $, el } from '../lib/dom.js';
import { formatClock, formatDuration, formatLongDate, plural } from '../lib/format.js';
import { server } from '../server/server.js';
import { createReportItem } from './report-item.js';
import { createReviewItem } from './review-item.js';
import { createWatchDial } from './watch-dial.js';

/** @typedef {import('../types.js').LogEntry} LogEntry */
/** @typedef {import('../domain/rounds.js').NightSchedule} NightSchedule */

/** @type {string | null} The night being shown, as a date key. Null means the latest night with scans. */
let selectedNight = null;
server.addEventListener('reset', () => {
  selectedNight = null;
});

export function renderDashboard() {
  const root = $('#dashboard-content');
  const state = server.state;
  if (!state.guards.length && !state.log.length) {
    root.replaceChildren(...emptyState());
    return;
  }

  selectedNight ??= latestNightWithScans();
  const now = Date.now();
  const schedule = getNightSchedule(selectedNight, state.rounds);
  const entries = state.log.filter((entry) => entry.time >= schedule.dayFrom && entry.time < schedule.dayTo);
  const checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.active);
  const shortestMinutes = shortestRoundMinutes(checkpoints);
  const rounds = buildRoundRows(entries, checkpoints, schedule, now, shortestMinutes);

  const reports = state.reports
    .filter((report) => report.time >= schedule.dayFrom && report.time < schedule.dayTo)
    .sort((a, b) => a.time - b.time);

  root.replaceChildren(
    ...header(entries, rounds, reports.length),
    ...reportsSection(reports),
    ...roundsSection(rounds, checkpoints, shortestMinutes),
    ...dialsSection(entries, schedule),
    ...reviewSection(entries),
    ...integritySection(),
  );
}

function latestNightWithScans() {
  const log = server.state.log;
  return nightKeyFor(log.length ? Math.max(...log.map((entry) => entry.time)) : Date.now());
}

function emptyState() {
  return [
    el('h1', { text: 'No patrol data yet' }),
    el('p', {
      class: 'summary',
      text: 'Load the demo site to see a full night of patrols, including the kinds of cheating the system flags. Or add your own guards and checkpoints in Setup.',
    }),
    el(
      'div',
      { class: 'form-row' },
      el('button', { class: 'button button--primary', text: 'Load the demo site', onclick: seedDemoSite }),
      el('button', { class: 'button', text: 'Open Setup', onclick: () => showView('setup') }),
    ),
  ];
}

/* ------------------------------------------------------------------------
   Header
   ------------------------------------------------------------------------ */

/**
 * @param {LogEntry[]} entries
 * @param {ReturnType<typeof buildRoundRows>} rounds
 * @param {number} reportCount
 */
function header(entries, rounds, reportCount) {
  const recorded = entries.filter((entry) => entry.result === 'ACCEPTED').length;
  const missed = rounds.reduce((total, round) => total + round.summary.missedCount, 0);
  const rushed = rounds.filter((round) => round.summary.result === RoundResult.RUSHED).length;
  const pending = entries.filter((entry) => needsReview(entry) && !server.state.reviews[entry.scanId]).length;

  /** @param {number} count @param {string} text */
  const counted = (count, text) => el('span', { class: count ? 'status-problem' : '', text });

  const nightPicker = el('input', { type: 'date', id: 'dashboard-night', value: selectedNight });
  nightPicker.addEventListener('change', () => {
    if (!nightPicker.value) return;
    selectedNight = nightPicker.value;
    renderDashboard();
  });

  return [
    el('h1', { text: `Night of ${formatLongDate(/** @type {string} */ (selectedNight))}` }),
    el(
      'p',
      { class: 'summary' },
      `${plural(recorded, 'scan')} recorded. `,
      counted(missed, `${plural(missed, 'checkpoint visit')} missed. `),
      counted(rushed, `${plural(rushed, 'rushed round')}. `),
      counted(pending, `${pending} ${pending === 1 ? 'scan needs' : 'scans need'} review. `),
      counted(reportCount, `${plural(reportCount, 'report')} from guards.`),
    ),
    el(
      'div',
      { class: 'form-row' },
      el('div', { class: 'form-field' }, el('label', { for: 'dashboard-night', text: 'Night starting' }), nightPicker),
      el('button', { class: 'button', text: 'Refresh', onclick: renderDashboard }),
    ),
  ];
}

/* ------------------------------------------------------------------------
   Reports from guards
   ------------------------------------------------------------------------ */

/** @param {import('../types.js').Report[]} reports */
function reportsSection(reports) {
  return [
    el('h2', { text: 'Reports from guards' }),
    reports.length
      ? el('ul', { class: 'report-list' }, reports.map(createReportItem))
      : el('p', { class: 'muted', text: 'No reports this night.' }),
  ];
}

/* ------------------------------------------------------------------------
   Rounds
   ------------------------------------------------------------------------ */

/**
 * @param {LogEntry[]} entries
 * @param {import('../types.js').Checkpoint[]} checkpoints
 * @param {NightSchedule} schedule
 * @param {number} now
 * @param {number | null} shortestMinutes
 */
function buildRoundRows(entries, checkpoints, schedule, now, shortestMinutes) {
  return schedule.windows.map((round) => {
    const cells = checkpoints.map((checkpoint) => checkpointStatus(entries, checkpoint.id, round, now));
    return { round, cells, summary: summarizeRound(cells, round, now, shortestMinutes) };
  });
}

/**
 * @param {ReturnType<typeof buildRoundRows>} rounds
 * @param {import('../types.js').Checkpoint[]} checkpoints
 * @param {number | null} shortestMinutes
 */
function roundsSection(rounds, checkpoints, shortestMinutes) {
  const shortest =
    shortestMinutes === null ? 'unknown until checkpoints have locations' : formatDuration(shortestMinutes);
  const table = el(
    'table',
    null,
    el(
      'thead',
      null,
      el(
        'tr',
        null,
        el('th', { text: 'Round' }),
        checkpoints.map((checkpoint) => el('th', { text: checkpoint.name })),
        el('th', { text: 'Result' }),
      ),
    ),
    el(
      'tbody',
      null,
      rounds.map(({ round, cells, summary }) =>
        el(
          'tr',
          null,
          el('td', { class: 'nowrap', text: `${formatClock(round.from)} to ${formatClock(round.to)}` }),
          cells.map(cellView),
          roundResultView(summary),
        ),
      ),
    ),
  );

  return [
    el('h2', { text: 'Rounds' }),
    el('p', {
      class: 'muted',
      text: `Every active checkpoint must be scanned once in each round. A complete round faster than 70% of the shortest realistic walk (${shortest}) is marked rushed.`,
    }),
    el('div', { class: 'table-scroll' }, table),
  ];
}

/** @type {Readonly<Record<string, string>>} */
const CELL_TEXT = Object.freeze({
  [CheckpointStatus.LATER]: 'later',
  [CheckpointStatus.DUE]: 'due',
  [CheckpointStatus.MISSED]: 'missed',
});

/** @param {ReturnType<typeof checkpointStatus>} cell */
function cellView({ status, firstScan }) {
  const text = firstScan
    ? `${formatClock(firstScan.time)}${status === CheckpointStatus.FLAGGED ? ', flagged' : ''}`
    : CELL_TEXT[status];
  return el('td', { class: `nowrap status-${status}`, text });
}

/** @param {ReturnType<typeof summarizeRound>} summary */
function roundResultView({ result, missedCount, minutes }) {
  /** @type {Record<string, [string, string]>} */
  const views = {
    [RoundResult.UPCOMING]: ['Upcoming', 'status-later'],
    [RoundResult.IN_PROGRESS]: ['In progress', 'status-due'],
    [RoundResult.MISSED]: [`${missedCount} missed`, 'status-missed'],
    [RoundResult.RUSHED]: [`Rushed: ${formatDuration(minutes)}`, 'status-rushed'],
    [RoundResult.COMPLETE]: [`Complete in ${formatDuration(minutes)}`, 'status-done'],
  };
  const [text, className] = views[result] ?? ['', ''];
  return el('td', { class: className, text });
}

/* ------------------------------------------------------------------------
   Each guard's night
   ------------------------------------------------------------------------ */

/** @param {LogEntry[]} entries @param {NightSchedule} schedule */
function dialsSection(entries, schedule) {
  /** @type {Map<string, LogEntry[]>} */
  const byGuard = new Map();
  for (const entry of entries) byGuard.set(entry.guardId, [...(byGuard.get(entry.guardId) ?? []), entry]);

  const dials = el('div', { class: 'dials' });
  if (!byGuard.size) dials.append(el('p', { class: 'muted', text: 'No scans this night.' }));
  for (const guardEntries of byGuard.values()) dials.append(guardDial(guardEntries, schedule));

  return [
    el('h2', { text: 'Each guard’s night' }),
    el('p', {
      class: 'muted',
      text: 'Read it like a watchman’s clock disc: midnight at the top, each mark a scan. Gaps are time with no patrol.',
    }),
    el(
      'div',
      { class: 'legend' },
      el('span', { text: 'Scan' }),
      el('span', { class: 'legend-flagged', text: 'Flagged or rejected scan' }),
    ),
    dials,
  ];
}

/** @param {LogEntry[]} guardEntries @param {NightSchedule} schedule */
function guardDial(guardEntries, schedule) {
  const accepted = guardEntries.filter((entry) => entry.result === 'ACCEPTED').sort((a, b) => a.time - b.time);
  const flaggedCount = guardEntries.filter(needsReview).length;
  const gap = longestGap(accepted);
  return el(
    'figure',
    { class: 'dial' },
    createWatchDial(guardEntries, guardEntries[0].guardName, schedule),
    el(
      'p',
      null,
      `${plural(accepted.length, 'scan')}, ${flaggedCount} flagged or rejected.`,
      gap ? ` Longest gap ${formatDuration(gap.minutes)}, ${formatClock(gap.from)} to ${formatClock(gap.to)}.` : '',
    ),
  );
}

/** @param {LogEntry[]} sortedEntries */
function longestGap(sortedEntries) {
  let longest = null;
  for (let i = 1; i < sortedEntries.length; i++) {
    const minutes = (sortedEntries[i].time - sortedEntries[i - 1].time) / 60_000;
    if (!longest || minutes > longest.minutes)
      longest = { minutes, from: sortedEntries[i - 1].time, to: sortedEntries[i].time };
  }
  return longest;
}

/* ------------------------------------------------------------------------
   Review
   ------------------------------------------------------------------------ */

/** @param {LogEntry[]} entries */
function reviewSection(entries) {
  const byTime = (/** @type {LogEntry} */ a, /** @type {LogEntry} */ b) => a.time - b.time;
  const important = entries.filter(needsReview).sort(byTime);
  const minor = entries.filter(hasOnlyMinorFlags).sort(byTime);

  const section = [el('h2', { text: 'Needs review' })];
  if (important.length) {
    section.push(
      el('p', {
        class: 'muted',
        text: 'Compare the photos with what the checkpoint really looks like. A photo of a phone screen or a printout, or an area that does not match, means the guard was not there.',
      }),
      reviewList(important),
    );
  } else {
    section.push(el('p', { class: 'muted', text: 'Nothing flagged for this night.' }));
  }
  if (minor.length)
    section.push(el('details', null, el('summary', { text: `Minor flags (${minor.length})` }), reviewList(minor)));
  return section;
}

/** @param {LogEntry[]} entries */
function reviewList(entries) {
  return el(
    'ul',
    { class: 'review-list' },
    entries.map((entry) =>
      createReviewItem(entry, server.state.reviews[entry.scanId], (verdict) => {
        server.state.reviews[entry.scanId] = { verdict, at: Date.now() };
        server.save();
        renderDashboard();
      }),
    ),
  );
}

/* ------------------------------------------------------------------------
   Log integrity
   ------------------------------------------------------------------------ */

function integritySection() {
  const result = el('p', { class: 'status-line', 'aria-live': 'polite' });
  const check = async () => {
    const verification = await server.verifyLog();
    if (verification.intact) {
      result.className = 'status-line';
      result.textContent = `All ${verification.count} entries are unchanged. Latest fingerprint ${verification.lastHash.slice(0, 16)}…`;
    } else {
      const { index, entry } = verification;
      result.className = 'status-line status-problem';
      result.textContent = `The log was changed at entry ${index + 1} (${formatClock(entry.time)}, ${entry.checkpointName || entry.checkpointId || 'unknown'}). Everything from there on can no longer be trusted.`;
    }
  };
  return [
    el('h2', { text: 'Log integrity' }),
    el('p', {
      class: 'muted',
      text: 'Each log entry includes a fingerprint of the one before it. Editing, deleting or inserting any entry breaks the chain from that point on. In production, the latest fingerprint is also copied to the Google Sheets report every night.',
    }),
    el('div', { class: 'form-row' }, el('button', { class: 'button', text: 'Check the log', onclick: check })),
    result,
  ];
}
