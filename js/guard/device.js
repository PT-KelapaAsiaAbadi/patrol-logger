// @ts-check
/** Everything the guard's phone keeps: who it belongs to, its signing key, and scans waiting to upload. */
import { STORAGE_KEYS } from '../config.js';
import { signText } from '../lib/crypto.js';
import { keyValueStore, localStore } from '../lib/storage.js';

/**
 * @typedef {object} DeviceSession
 * @property {string} token
 * @property {number} expiresAt
 *
 * @typedef {object} DeviceState
 * @property {string | null} guardId
 * @property {string} name
 * @property {'guard' | 'supervisor'} role
 * @property {DeviceSession | null} session
 * @property {number} sequence      Number of the last scan this phone created.
 * @property {string} lastHash      Hash of the last scan request this phone created.
 * @property {boolean} offline      Prototype control: pretend there is no signal.
 * @property {boolean} simulateCamera  Prototype control: use simulated scans instead of the camera.
 *
 * @typedef {object} QueuedUpload  A signed request waiting for signal.
 * @property {'scan' | 'report'} kind
 * @property {string} body
 * @property {string} signature
 * @property {string[]} photos      Report photos as JPEG data URLs. Scans carry none.
 * @property {number} takenAt
 * @property {string} checkpointName
 */

/** @returns {DeviceState} */
const emptyDeviceState = () => ({
  guardId: null,
  name: '',
  role: 'guard',
  session: null,
  sequence: 0,
  lastHash: 'START',
  offline: false,
  simulateCamera: false,
});

class GuardDevice {
  /** @type {DeviceState} */
  state = emptyDeviceState();
  /** @type {CryptoKeyPair | null} */
  #keys = null;

  load() {
    this.state = { ...emptyDeviceState(), ...localStore.read(STORAGE_KEYS.device, {}) };
  }

  save() {
    localStore.write(STORAGE_KEYS.device, this.state);
  }

  get hasActiveShift() {
    return Boolean(this.state.session) && Date.now() < (this.state.session?.expiresAt ?? 0);
  }

  async isEnrolled() {
    return Boolean(this.state.guardId) && Boolean(await this.#loadKeys());
  }

  /** @param {CryptoKeyPair} keys @param {{ guardId: string, name: string, role: 'guard' | 'supervisor' }} owner */
  async enroll(keys, owner) {
    this.#keys = keys;
    await keyValueStore.set(STORAGE_KEYS.deviceKeys, keys);
    this.state = { ...emptyDeviceState(), ...owner };
    this.save();
    await this.writeQueue([]);
  }

  /** @param {string} text */
  async sign(text) {
    const keys = await this.#loadKeys();
    if (!keys) throw new Error('This phone is not set up.');
    return signText(keys.privateKey, text);
  }

  endShift() {
    this.state.session = null;
    this.save();
  }

  async forget() {
    this.state = emptyDeviceState();
    this.#keys = null;
    this.save();
    await keyValueStore.delete(STORAGE_KEYS.deviceKeys);
    await keyValueStore.delete(STORAGE_KEYS.uploadQueue);
  }

  /** @returns {Promise<QueuedUpload[]>} */
  async readQueue() {
    return (await keyValueStore.get(STORAGE_KEYS.uploadQueue)) ?? [];
  }

  /** @param {QueuedUpload[]} queue */
  async writeQueue(queue) {
    await keyValueStore.set(STORAGE_KEYS.uploadQueue, queue);
  }

  async #loadKeys() {
    this.#keys ??= (await keyValueStore.get(STORAGE_KEYS.deviceKeys)) ?? null;
    return this.#keys;
  }
}

export const device = new GuardDevice();
