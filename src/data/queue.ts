/**
 * The offline outbox. This file stays in production: it runs on the guard's phone.
 *
 * Why an outbox: basements, stairwells and rooftops often have no signal.
 * A scan is saved here first with the time it happened, then sent when the phone is back online.
 * Because each scan carries an id made on the phone, sending it twice is harmless.
 *
 * Storage is IndexedDB, which holds hundreds of MB, so queued report photos fit. The rest of
 * the app reads and writes an in-memory copy synchronously; every change is then saved to
 * IndexedDB in order. `loadOutbox()` must finish before the app starts.
 */
import { createStore, get, set } from "idb-keyval";
import type { PendingScan, Report } from "../types";

const KEY = "outbox";
const LEGACY_LOCALSTORAGE_KEY = "patrol-outbox-v1"; // where the outbox lived before IndexedDB

export type OutboxItem =
	| { kind: "scan"; scan: PendingScan }
	// guardId: who wrote the report. Missing on reports queued by older versions of the app.
	| { kind: "report"; report: Report; guardId?: string };

interface Outbox {
	items: OutboxItem[];
	rejected: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

let cache: Outbox = { items: [], rejected: 0 };
let idb: ReturnType<typeof createStore> | null = null;
let saving: Promise<void> = Promise.resolve();

function readLocalStorage(): Outbox | null {
	try {
		const raw = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
		return raw ? (JSON.parse(raw) as Outbox) : null;
	} catch {
		return null;
	}
}

/**
 * Reads the outbox into memory. Moves an outbox left in localStorage by an older version of the
 * app into IndexedDB. If IndexedDB isn't available, keeps using localStorage.
 */
export async function loadOutbox(): Promise<void> {
	// Ask the browser not to clear this site's storage when the phone runs low on space.
	void navigator.storage?.persist?.().catch(() => false);
	try {
		const store = createStore("patroli", "outbox");
		const stored = await get<Outbox>(KEY, store);
		idb = store;
		const legacy = readLocalStorage();
		if (legacy?.items.length || legacy?.rejected) {
			cache = {
				items: [...(stored?.items ?? []), ...legacy.items],
				rejected: (stored?.rejected ?? 0) + legacy.rejected,
			};
			await set(KEY, cache, store);
			localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
		} else if (stored) {
			cache = stored;
		}
	} catch (e) {
		console.error(
			"IndexedDB unavailable, keeping the outbox in localStorage",
			e,
		);
		idb = null;
		cache = readLocalStorage() ?? { items: [], rejected: 0 };
	}
}

function write(next: Outbox) {
	cache = next;
	listeners.forEach((l) => l());
	// Saves run one after another so an older state can never overwrite a newer one.
	saving = saving.then(async () => {
		try {
			if (idb) await set(KEY, cache, idb);
			else
				localStorage.setItem(
					LEGACY_LOCALSTORAGE_KEY,
					JSON.stringify(cache),
				);
		} catch (e) {
			// Still in memory, and saved again with the next change.
			console.error("Could not save the outbox", e);
		}
	});
}

/** Resolves when every change so far is on disk. */
export const outboxSaved = () => saving;

export const outboxItems = () => cache.items;
export const rejectedCount = () => cache.rejected;

export function enqueue(item: OutboxItem) {
	write({ ...cache, items: [...cache.items, item] });
}

export function removeItem(item: OutboxItem) {
	write({ ...cache, items: cache.items.filter((i) => i !== item) });
}

export function markRejected(item: OutboxItem) {
	write({
		items: cache.items.filter((i) => i !== item),
		rejected: cache.rejected + 1,
	});
}

export function clearRejected() {
	write({ ...cache, rejected: 0 });
}

export function onOutboxChange(l: Listener): () => void {
	listeners.add(l);
	return () => listeners.delete(l);
}
