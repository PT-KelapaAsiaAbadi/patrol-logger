// @ts-check
import { ROUNDS, SERVER_DEFAULTS, STORAGE_KEYS } from '../config.js';
import { localStore } from '../lib/storage.js';

const STATE_VERSION = 2;

/** @returns {import('../types.js').ServerState} */
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
    photoHashes: {},
    config: { ...SERVER_DEFAULTS },
  };
}

/** @returns {import('../types.js').ServerState} */
export function loadState() {
  /** @type {any} */
  const saved = localStore.read(STORAGE_KEYS.server, null);
  if (!saved || saved.version !== STATE_VERSION) return createEmptyState();
  return { ...createEmptyState(), ...saved, config: { ...SERVER_DEFAULTS, ...saved.config } };
}

/** @param {import('../types.js').ServerState} state */
export function saveState(state) {
  localStore.write(STORAGE_KEYS.server, state);
}
