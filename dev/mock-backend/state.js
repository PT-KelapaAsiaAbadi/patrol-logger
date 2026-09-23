// @ts-check
import { ROUNDS, SERVER_DEFAULTS, STORAGE_KEYS } from '../../shared/config.js';
import { localStore } from '../../shared/lib/storage.js';

const STATE_VERSION = 2;

/** @returns {import('../../shared/types.js').ServerState} */
export function createEmptyState() {
  return {
    version: STATE_VERSION,
    guards: [],
    checkpoints: [],
    rounds: { ...ROUNDS.defaults },
    log: [],
    reviews: {},
    reports: [],
    outcomes: {},
    reportPhotoHashes: {},
    config: { ...SERVER_DEFAULTS },
  };
}

/** @returns {import('../../shared/types.js').ServerState} */
export function loadState() {
  /** @type {any} */
  const saved = localStore.read(STORAGE_KEYS.server, null);
  if (!saved || saved.version !== STATE_VERSION) return createEmptyState();
  return { ...createEmptyState(), ...saved, config: { ...SERVER_DEFAULTS, ...saved.config } };
}

/** @param {import('../../shared/types.js').ServerState} state */
export function saveState(state) {
  localStore.write(STORAGE_KEYS.server, state);
}
