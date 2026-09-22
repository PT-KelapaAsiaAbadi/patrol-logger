// @ts-check
/** One flagged or rejected scan in the review list, with its photos and the supervisor's decision. */
import { FLAG_DESCRIPTIONS } from '../domain/flags.js';
import { el } from '../lib/dom.js';
import { formatClock } from '../lib/format.js';
import { loadPhoto } from '../server/server.js';

/**
 * @param {import('../types.js').LogEntry} entry
 * @param {import('../types.js').Review | undefined} review
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
      photoStrip(entry),
    ),
    decisionControls(review, onDecide),
  );
}

/** @param {import('../types.js').LogEntry} entry */
function measurementLine(entry) {
  const parts = [];
  if (entry.distance !== null) parts.push(`${entry.distance} m from the checkpoint`);
  if (entry.accuracy !== null) parts.push(`GPS accurate to ${entry.accuracy} m`);
  return parts.length ? el('p', { class: 'review-meta', text: `${parts.join('. ')}.` }) : null;
}

/** @param {import('../types.js').LogEntry} entry */
function mapLink(entry) {
  if (entry.lat === null || entry.lng === null) return null;
  return el('a', {
    href: `https://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lng}#map=19/${entry.lat}/${entry.lng}`,
    target: '_blank',
    rel: 'noopener',
    text: 'Open location on map',
  });
}

/** Photos load from storage after the list is on screen. @param {import('../types.js').LogEntry} entry */
function photoStrip(entry) {
  const strip = el('div', { class: 'review-photos' });
  for (const [hash, caption] of /** @type {const} */ ([
    [entry.codePhoto, 'Code'],
    [entry.areaPhoto, 'Area'],
  ])) {
    if (!hash) continue;
    const image = el('img', { alt: `${caption} photo for ${entry.checkpointName || 'this scan'}` });
    loadPhoto(hash).then((source) => {
      if (source) image.src = source;
    });
    strip.append(el('figure', null, image, el('figcaption', { text: caption })));
  }
  return strip;
}

/**
 * @param {import('../types.js').Review | undefined} review
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
