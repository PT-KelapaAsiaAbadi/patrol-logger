// @ts-check
/** One report a guard sent after a scan: note, photos, and any warnings about it. */
import { FLAG_DESCRIPTIONS } from '../domain/flags.js';
import { el } from '../lib/dom.js';
import { formatClock } from '../lib/format.js';
import { loadPhoto } from '../server/server.js';

/** @param {import('../types.js').Report} report */
export function createReportItem(report) {
  return el(
    'li',
    { class: 'report-item' },
    el('p', {
      class: 'report-item-title',
      text: `${formatClock(report.time)}  ${report.checkpointName}, ${report.guardName}`,
    }),
    report.text ? el('p', { class: 'report-item-text', text: report.text }) : null,
    report.flags.length
      ? el(
          'ul',
          { class: 'review-reasons status-problem' },
          report.flags.map((flag) => el('li', { text: FLAG_DESCRIPTIONS[flag] ?? flag })),
        )
      : null,
    photoStrip(report),
  );
}

/** @param {import('../types.js').Report} report */
function photoStrip(report) {
  if (!report.photos.length) return null;
  const strip = el('div', { class: 'review-photos' });
  report.photos.forEach((hash, index) => {
    const image = el('img', { alt: `Photo ${index + 1} of ${report.photos.length} from ${report.guardName}` });
    loadPhoto(hash).then((source) => {
      if (source) image.src = source;
    });
    strip.append(el('figure', null, image));
  });
  return strip;
}
