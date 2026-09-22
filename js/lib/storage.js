// @ts-check
/*
 * Storage wrappers. Some viewers block storage, so every call is guarded
 * and the key-value store falls back to memory for the current page load.
 */

export const localStore = {
  /** @template T @param {string} key @param {T} fallback @returns {T} */
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  /** @param {string} key @param {unknown} value */
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  /** @param {string} key */
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable: nothing to remove */
    }
  },
};

/** IndexedDB key-value store, for values too large or too complex for localStorage (photos, crypto keys). */
class KeyValueStore {
  /** @type {Map<string, unknown>} */
  #memory = new Map();
  /** @type {Promise<IDBDatabase> | null} */
  #database = null;
  #name;

  /** @param {string} databaseName */
  constructor(databaseName) {
    this.#name = databaseName;
  }

  /** @param {string} key @returns {Promise<any>} */
  async get(key) {
    try {
      const store = await this.#store('readonly');
      return await this.#request(store.get(key));
    } catch {
      return this.#memory.get(key);
    }
  }

  /** @param {string} key @param {unknown} value */
  async set(key, value) {
    this.#memory.set(key, value);
    try {
      const store = await this.#store('readwrite');
      await this.#request(store.put(value, key));
    } catch {
      /* the memory copy is used for the rest of this page load */
    }
  }

  /** @param {string} key */
  async delete(key) {
    this.#memory.delete(key);
    try {
      const store = await this.#store('readwrite');
      await this.#request(store.delete(key));
    } catch {
      /* nothing stored */
    }
  }

  async clear() {
    this.#memory.clear();
    try {
      const store = await this.#store('readwrite');
      await this.#request(store.clear());
    } catch {
      /* nothing stored */
    }
  }

  /** @param {IDBTransactionMode} mode */
  async #store(mode) {
    const database = await this.#open();
    return database.transaction('values', mode).objectStore('values');
  }

  #open() {
    this.#database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.#database;
  }

  /** @param {IDBRequest} request */
  #request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const keyValueStore = new KeyValueStore('patrol_prototype_v2');
