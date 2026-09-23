// @ts-check
/** One flagged or rejected scan in the review list, with the supervisor's decision. */
import { FLAG_DESCRIPTIONS } from '../../../../shared/domain/flags.js';
import { el } from '../../../../shared/lib/dom.js';
import { formatClock } from '../../../../shared/lib/format.js';

/**
 * @param {import('../../../../shared/types.js').LogEntry} entry
 * @param {import('../../../../shared/types.js').Review | undefined} review
 * @param {(verdict: 'fine' | 'suspicious') => void} onDecide
 */
export function createReviewItem(entry, review, onDecide) {
  const title = `${formatClock(entry.time)}  ${entry.checkpointName || entry.checkpointId || 'Unknown code'}, ${entry.guardName}`;
  return el(
    'li',
    { class: 'review-item' },
    el(
      'div',
      null,
      el('p', { class: 'review-title' }, title, entry.result === 'REJECTED' ? ' (not recorded)' : ''),
      el(
        'ul',
        { class: 'review-reasons' },
        entry.flags.map((flag) => el('li', { text: FLAG_DESCRIPTIONS[flag] ?? flag })),
      ),
      measurementLine(entry),
      mapLink(entry),
    ),
    decisionControls(review, onDecide),
  );
}

/** @param {import('../../../../shared/types.js').LogEntry} entry */
function measurementLine(entry) {
  const parts = [];
  if (entry.distance !== null) parts.push(`${entry.distance} m from the checkpoint`);
  if (entry.accuracy !== null) parts.push(`GPS accurate to ${entry.accuracy} m`);
  return parts.length ? el('p', { class: 'review-meta', text: `${parts.join('. ')}.` }) : null;
}

/** @param {import('../../../../shared/types.js').LogEntry} entry */
function mapLink(entry) {
  if (entry.lat === null || entry.lng === null) return null;
  return el('a', {
    href: `https://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lng}#map=19/${entry.lat}/${entry.lng}`,
    target: '_blank',
    rel: 'noopener',
    text: 'Open location on map',
  });
}

/**
 * @param {import('../../../../shared/types.js').Review | undefined} review
 * @param {(verdict: 'fine' | 'suspicious') => void} onDecide
 */
function decisionControls(review, onDecide) {
  if (review) {
    const suspicious = review.verdict === 'suspicious';
    return el('p', {
      class: `review-verdict ${suspicious ? 'status-problem' : ''}`,
      text: `${suspicious ? 'Marked suspicious' : 'Marked fine'} at ${formatClock(review.at)}`,
    });
  }
  return el(
    'div',
    { class: 'button-group' },
    el('button', { class: 'button button--small', text: 'Mark fine', onclick: () => onDecide('fine') }),
    el('button', {
      class: 'button button--small button--danger',
      text: 'Mark suspicious',
      onclick: () => onDecide('suspicious'),
    }),
  );
}
