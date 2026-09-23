// @ts-check
/**
 * After a scan: "Do you have anything to report?"
 * Yes opens a form with an optional note and 0 to 5 photos; a report needs at least one of the two.
 */
import { REPORTS } from '../../../shared/config.js';
import { $, el } from '../../../shared/lib/dom.js';
import { prepareReportPhoto } from './report-photos.js';
import { Screen, showResult, showScreen } from './screens.js';
import { submitReport } from './uploads.js';

/**
 * @typedef {object} ReportDraft
 * @property {import('./uploads.js').ScanResult} scan
 * @property {import('../../../shared/types.js').ReportPhoto[]} photos
 */

/** @type {ReportDraft | null} */
let draft = null;
/** @type {() => void} */
let returnHome = () => {};

const SCAN_STATUS = Object.freeze({
  recorded: { tone: 'tone-ok', text: 'Scan recorded' },
  flagged: { tone: 'tone-warn', text: 'Scan recorded, will be reviewed' },
  queued: { tone: 'tone-warn', text: 'Scan saved on this phone, uploads when signal returns' },
});

/** @param {{ onFinished: () => void }} options */
export function initReportScreen({ onFinished }) {
  returnHome = onFinished;
  $('#report-no').addEventListener('click', () => returnHome());
  $('#report-yes').addEventListener('click', () => showForm(true));
  $('#report-cancel').addEventListener('click', () => showForm(false));
  $('#report-add-photo').addEventListener('click', () => $('#report-photo-input').click());
  $('#report-photo-input').addEventListener('change', addPickedPhotos);
  $('#report-send').addEventListener('click', sendReport);
}

/** @param {import('./uploads.js').ScanResult} scan  A scan that was recorded or saved, never a rejected one. */
export function openReport(scan) {
  draft = { scan, photos: [] };
  const status = SCAN_STATUS[/** @type {'recorded' | 'flagged' | 'queued'} */ (scan.kind)];
  const statusLine = $('#report-scan-status');
  statusLine.className = `report-scan-status ${status.tone}`;
  statusLine.textContent = status.text;
  $('#report-checkpoint').textContent = scan.checkpointName;
  $('#report-text').value = '';
  $('#report-error').textContent = '';
  renderPhotos();
  showForm(false);
  showScreen(Screen.REPORT);
}

/** @param {boolean} visible */
function showForm(visible) {
  $('#report-question').hidden = visible;
  $('#report-form').hidden = !visible;
}

/** @param {Event} event */
async function addPickedPhotos(event) {
  if (!draft) return;
  const input = /** @type {HTMLInputElement} */ (event.target);
  const files = Array.from(input.files ?? []);
  input.value = ''; // allow picking the same photo again after removing it

  const room = REPORTS.maxPhotos - draft.photos.length;
  const accepted = files.slice(0, room);
  $('#report-error').textContent =
    files.length > room
      ? `A report can have up to ${REPORTS.maxPhotos} photos. ${room === 0 ? 'No more were added.' : `Only the first ${room} were added.`}`
      : '';

  for (const file of accepted) {
    try {
      draft.photos.push(await prepareReportPhoto(file));
    } catch (error) {
      $('#report-error').textContent = /** @type {Error} */ (error).message;
    }
  }
  renderPhotos();
}

function renderPhotos() {
  const photos = draft?.photos ?? [];
  $('#report-photos').replaceChildren(
    ...photos.map((photo, index) =>
      el(
        'li',
        null,
        el('img', { src: photo.dataUrl, alt: `Report photo ${index + 1}` }),
        el('button', { type: 'button', text: 'Remove', onclick: () => removePhoto(index) }),
      ),
    ),
  );
  $('#report-photo-count').textContent = `${photos.length} of ${REPORTS.maxPhotos}`;
  $('#report-add-photo').disabled = photos.length >= REPORTS.maxPhotos;
}

/** @param {number} index */
function removePhoto(index) {
  draft?.photos.splice(index, 1);
  $('#report-error').textContent = '';
  renderPhotos();
}

async function sendReport() {
  if (!draft) return;
  const text = $('#report-text').value.trim();
  if (!text && draft.photos.length === 0) {
    $('#report-error').textContent = 'Write a note or add at least one photo, or go back and choose No.';
    return;
  }

  const button = $('#report-send');
  button.disabled = true;
  try {
    const { scan, photos } = draft;
    const result = await submitReport({ scanId: scan.scanId, checkpointName: scan.checkpointName, text, photos });
    draft = null;
    const views = {
      sent: { status: 'Report sent', tone: /** @type {const} */ ('ok') },
      queued: { status: 'Waiting to upload', tone: /** @type {const} */ ('warn') },
      failed: { status: 'Report not sent', tone: /** @type {const} */ ('bad') },
    };
    showResult({ ...views[result.kind], title: scan.checkpointName, message: result.message });
  } finally {
    button.disabled = false;
  }
}
