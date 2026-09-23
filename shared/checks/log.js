// @ts-check
/**
 * Append-only log with a hash chain: each entry's hash covers the previous entry's hash,
 * so editing, deleting or inserting any entry breaks every hash after it.
 */
import { sha256Hex } from '../lib/crypto.js';

const GENESIS_HASH = 'GENESIS';
const FIELD_SEPARATOR = '\u001f';

/** Fields covered by the hash, in a fixed order. */
const CHAINED_FIELDS = /** @type {const} */ ([
  'scanId',
  'time',
  'receivedAt',
  'guardId',
  'guardName',
  'checkpointId',
  'checkpointName',
  'result',
  'flags',
  'lat',
  'lng',
  'accuracy',
  'distance',
  'prevHash',
]);

/** @param {import('../types.js').LogEntry} entry */
function canonicalForm(entry) {
  return CHAINED_FIELDS.map((field) => {
    const value = entry[field];
    if (Array.isArray(value)) return value.join(' ');
    return value === null || value === undefined ? '' : String(value);
  }).join(FIELD_SEPARATOR);
}

/**
 * @param {import('../types.js').LogEntry[]} log
 * @param {import('../types.js').LogEntry} entry
 */
export async function appendLogEntry(log, entry) {
  entry.prevHash = log.at(-1)?.hash ?? GENESIS_HASH;
  entry.hash = await sha256Hex(canonicalForm(entry));
  log.push(entry);
}

/**
 * @param {import('../types.js').LogEntry[]} log
 * @returns {Promise<{ intact: true, count: number, lastHash: string } | { intact: false, index: number, entry: import('../types.js').LogEntry }>}
 */
export async function verifyLogChain(log) {
  let expectedPrevious = GENESIS_HASH;
  for (let index = 0; index < log.length; index++) {
    const entry = log[index];
    const hashMatches = (await sha256Hex(canonicalForm(entry))) === entry.hash;
    if (entry.prevHash !== expectedPrevious || !hashMatches) return { intact: false, index, entry };
    expectedPrevious = /** @type {string} */ (entry.hash);
  }
  return { intact: true, count: log.length, lastHash: expectedPrevious };
}
