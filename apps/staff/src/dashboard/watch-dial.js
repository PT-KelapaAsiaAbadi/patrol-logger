// @ts-check
/**
 * One guard's night drawn like a watchman's clock chart: a 24-hour disc with midnight at the top,
 * the scheduled patrol period as a band, and a mark for every scan.
 */
import { needsReview } from '../../../../shared/domain/flags.js';
import { formatClock, pad2 } from '../../../../shared/lib/format.js';
import { svgEl } from '../../../../shared/lib/dom.js';

const SIZE = 240;
const CENTRE = SIZE / 2;
const RADIUS = 104;
const MAJOR_HOURS = [0, 6, 12, 18];

/** Angle for a time of day, with midnight at the top. @param {number} ms */
function angleFor(ms) {
  const date = new Date(ms);
  const minutes = date.getHours() * 60 + date.getMinutes();
  return (minutes / 1440) * 2 * Math.PI - Math.PI / 2;
}

/** @param {number} angle @param {number} radius */
function pointAt(angle, radius) {
  return { x: CENTRE + radius * Math.cos(angle), y: CENTRE + radius * Math.sin(angle) };
}

/**
 * @param {import('../../../../shared/types.js').LogEntry[]} entries  One guard's scans, any order.
 * @param {string} guardName
 * @param {{ start: number, end: number }} schedule
 */
export function createWatchDial(entries, guardName, schedule) {
  const svg = svgEl('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, role: 'img' });
  svg.setAttribute(
    'aria-label',
    `${guardName}: ${entries.length} scans between ${formatClock(schedule.start)} and ${formatClock(schedule.end)}`,
  );

  svg.append(
    svgEl('circle', { cx: CENTRE, cy: CENTRE, r: RADIUS, fill: 'none' }, { stroke: 'var(--ink)', strokeWidth: '1.2' }),
    patrolBand(schedule),
    ...hourTicks(),
    ...hourLabels(),
    ...entries.map(scanMark),
    centreText(guardName.split(' ')[0], CENTRE - 2, { fill: 'var(--ink)', fontSize: '14px', fontWeight: '700' }),
    centreText(`${formatClock(schedule.start)} to ${formatClock(schedule.end)}`, CENTRE + 16, {
      fill: 'var(--muted)',
      fontSize: '11px',
    }),
  );
  return svg;
}

/** @param {{ start: number, end: number }} schedule */
function patrolBand(schedule) {
  const bandRadius = RADIUS - 7;
  const from = angleFor(schedule.start);
  let sweep = angleFor(schedule.end) - from;
  if (sweep <= 0) sweep += 2 * Math.PI;
  const start = pointAt(from, bandRadius);
  const end = pointAt(from + sweep, bandRadius);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return svgEl(
    'path',
    {
      d: `M ${start.x} ${start.y} A ${bandRadius} ${bandRadius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
      fill: 'none',
    },
    { stroke: 'var(--rule)', strokeWidth: '14', opacity: '0.7' },
  );
}

function hourTicks() {
  return Array.from({ length: 24 }, (_, hour) => {
    const isMajor = hour % 6 === 0;
    const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
    const outer = pointAt(angle, RADIUS);
    const inner = pointAt(angle, RADIUS - (isMajor ? 14 : 7));
    return svgEl(
      'line',
      { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y },
      { stroke: 'var(--ink)', strokeWidth: isMajor ? '1.6' : '0.8' },
    );
  });
}

function hourLabels() {
  return MAJOR_HOURS.map((hour) => {
    const position = pointAt((hour / 24) * 2 * Math.PI - Math.PI / 2, RADIUS - 26);
    const label = svgEl(
      'text',
      { x: position.x, y: position.y + 4, 'text-anchor': 'middle' },
      { fill: 'var(--muted)', fontSize: '11px' },
    );
    label.textContent = pad2(hour);
    return label;
  });
}

/** Flagged and rejected scans are longer and red. @param {import('../../../../shared/types.js').LogEntry} entry */
function scanMark(entry) {
  const flagged = needsReview(entry);
  const angle = angleFor(entry.time);
  const outer = pointAt(angle, RADIUS - 2);
  const inner = pointAt(angle, RADIUS - (flagged ? 44 : 36));
  return svgEl(
    'line',
    { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y },
    { stroke: flagged ? 'var(--alert)' : 'var(--stamp)', strokeWidth: flagged ? '2.6' : '1.8' },
  );
}

/** @param {string} text @param {number} y @param {Partial<CSSStyleDeclaration>} style */
function centreText(text, y, style) {
  const element = svgEl('text', { x: CENTRE, y, 'text-anchor': 'middle' }, style);
  element.textContent = text;
  return element;
}
