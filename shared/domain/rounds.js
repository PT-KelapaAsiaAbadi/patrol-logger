// @ts-check
/** Round schedules, and what counts as done, missed or rushed. */
import { ROUNDS } from '../config.js';
import { minutesOfDay, parseDateKey, toDateKey } from '../lib/format.js';
import { distanceMeters, hasPosition } from '../lib/geo.js';
import { needsReview } from './flags.js';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const NOON_MS = 12 * 3_600_000;

/**
 * @typedef {{ from: number, to: number }} RoundWindow
 * @typedef {object} NightSchedule
 * @property {number} start        First round starts.
 * @property {number} end          Last round ends.
 * @property {RoundWindow[]} windows
 * @property {number} dayFrom      Noon before the night, so scans outside round hours still belong somewhere.
 * @property {number} dayTo        Noon after the night.
 */

/**
 * Nights run from noon to noon: a scan at 02:00 belongs to the previous evening's night.
 * @param {number} ms
 */
export function nightKeyFor(ms) {
  const date = new Date(ms);
  if (date.getHours() < 12) date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

/**
 * @param {string} nightKey
 * @param {import('../types.js').RoundSettings} rounds
 * @returns {NightSchedule}
 */
export function getNightSchedule(nightKey, rounds) {
  const midnight = parseDateKey(nightKey).getTime();
  const start = midnight + minutesOfDay(rounds.start) * MINUTE_MS;
  let end = midnight + minutesOfDay(rounds.end) * MINUTE_MS;
  if (end <= start) end += DAY_MS;

  const interval = Math.max(ROUNDS.minimumIntervalMinutes, rounds.everyMinutes) * MINUTE_MS;
  const windows = [];
  for (let from = start; from < end; from += interval) windows.push({ from, to: Math.min(from + interval, end) });

  const dayFrom = midnight + NOON_MS;
  return { start, end, windows, dayFrom, dayTo: dayFrom + DAY_MS };
}

/** @param {NightSchedule} schedule @param {number} ms */
export function findWindowAt(schedule, ms) {
  return schedule.windows.find((window) => ms >= window.from && ms < window.to) ?? null;
}

/**
 * Shortest realistic time for one round: the shortest walk through every checkpoint,
 * with a detour factor for real paths, patrol walking speed, and time to take the photos.
 * @param {import('../types.js').Checkpoint[]} checkpoints
 * @returns {number | null} minutes, or null when no checkpoint has a location
 */
export function shortestRoundMinutes(checkpoints) {
  const located = /** @type {import('../types.js').Position[]} */ (checkpoints.filter(hasPosition));
  if (located.length === 0) return null;
  if (located.length === 1) return ROUNDS.minutesPerCheckpoint;

  const walkingMetres = located.map((a) => located.map((b) => distanceMeters(a, b) * ROUNDS.detourFactor));
  const metres =
    located.length <= ROUNDS.exactSearchLimit
      ? shortestPathExact(walkingMetres)
      : shortestPathNearestNeighbour(walkingMetres);

  const walkingMinutes = (metres / 1000 / ROUNDS.patrolSpeedKmh) * 60;
  return walkingMinutes + located.length * ROUNDS.minutesPerCheckpoint;
}

/** Exhaustive search with pruning; fine for up to about 8 points. @param {number[][]} distances */
function shortestPathExact(distances) {
  const count = distances.length;
  const visited = new Array(count).fill(false);
  let best = Infinity;

  /** @param {number} current @param {number} visitedCount @param {number} length */
  const extend = (current, visitedCount, length) => {
    if (length >= best) return;
    if (visitedCount === count) {
      best = length;
      return;
    }
    for (let next = 0; next < count; next++) {
      if (visited[next]) continue;
      visited[next] = true;
      extend(next, visitedCount + 1, length + distances[current][next]);
      visited[next] = false;
    }
  };

  for (let start = 0; start < count; start++) {
    visited[start] = true;
    extend(start, 1, 0);
    visited[start] = false;
  }
  return best;
}

/** Greedy approximation for larger sites. @param {number[][]} distances */
function shortestPathNearestNeighbour(distances) {
  const visited = new Set([0]);
  let current = 0;
  let length = 0;
  while (visited.size < distances.length) {
    let nearest = -1;
    for (let candidate = 0; candidate < distances.length; candidate++) {
      if (visited.has(candidate)) continue;
      if (nearest < 0 || distances[current][candidate] < distances[current][nearest]) nearest = candidate;
    }
    visited.add(nearest);
    length += distances[current][nearest];
    current = nearest;
  }
  return length;
}

export const CheckpointStatus = Object.freeze({
  DONE: 'done',
  FLAGGED: 'flagged',
  LATER: 'later',
  DUE: 'due',
  MISSED: 'missed',
});

/**
 * @param {import('../types.js').LogEntry[]} entries
 * @param {string} checkpointId
 * @param {RoundWindow} window
 * @param {number} now
 * @returns {{ status: string, firstScan: import('../types.js').LogEntry | null }}
 */
export function checkpointStatus(entries, checkpointId, window, now) {
  const scans = entries
    .filter(
      (e) => e.result === 'ACCEPTED' && e.checkpointId === checkpointId && e.time >= window.from && e.time < window.to,
    )
    .sort((a, b) => a.time - b.time);

  if (scans.length) {
    return { status: scans.some(needsReview) ? CheckpointStatus.FLAGGED : CheckpointStatus.DONE, firstScan: scans[0] };
  }
  if (now < window.from) return { status: CheckpointStatus.LATER, firstScan: null };
  if (now < window.to) return { status: CheckpointStatus.DUE, firstScan: null };
  return { status: CheckpointStatus.MISSED, firstScan: null };
}

export const RoundResult = Object.freeze({
  UPCOMING: 'upcoming',
  IN_PROGRESS: 'in-progress',
  MISSED: 'missed',
  RUSHED: 'rushed',
  COMPLETE: 'complete',
});

/**
 * @param {{ status: string, firstScan: import('../types.js').LogEntry | null }[]} cells
 * @param {RoundWindow} window
 * @param {number} now
 * @param {number | null} shortestMinutes
 * @returns {{ result: string, missedCount: number, minutes: number }}
 */
export function summarizeRound(cells, window, now, shortestMinutes) {
  const missedCount = cells.filter((cell) => cell.status === CheckpointStatus.MISSED).length;
  if (now < window.from) return { result: RoundResult.UPCOMING, missedCount, minutes: 0 };
  if (missedCount) return { result: RoundResult.MISSED, missedCount, minutes: 0 };

  const firstTimes = cells.flatMap((cell) => (cell.firstScan ? [cell.firstScan.time] : []));
  if (firstTimes.length === cells.length && cells.length > 1) {
    const minutes = (Math.max(...firstTimes) - Math.min(...firstTimes)) / MINUTE_MS;
    const isRushed = shortestMinutes !== null && minutes < shortestMinutes * ROUNDS.rushedRatio;
    return { result: isRushed ? RoundResult.RUSHED : RoundResult.COMPLETE, missedCount, minutes };
  }
  return { result: RoundResult.IN_PROGRESS, missedCount, minutes: 0 };
}
