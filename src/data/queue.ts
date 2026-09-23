/**
 * The offline outbox. This file stays in production: it runs on the guard's phone.
 *
 * Why an outbox: basements, stairwells and rooftops often have no signal.
 * A scan is saved here first with the time it happened, then sent when the phone is back online.
 * Because each scan carries an id made on the phone, sending it twice is harmless.
 *
 * Prototype uses localStorage for simplicity. For production, move this to IndexedDB
 * (the `idb` package) so photos in queued reports don't hit localStorage's ~5 MB limit.
 */
import type { PendingScan, Report } from '../types';

const KEY = 'patrol-outbox-v1';

export type OutboxItem =
  | { kind: 'scan'; scan: PendingScan }
  | { kind: 'report'; report: Report };

interface Outbox { items: OutboxItem[]; rejected: number }

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): Outbox {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Outbox;
  } catch { /* ignore */ }
  return { items: [], rejected: 0 };
}

function write(o: Outbox) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage full: item stays in memory until reload */ }
  cache = o;
  listeners.forEach((l) => l());
}

let cache: Outbox | null = null;
const outbox = () => (cache ??= read());

export const outboxItems = () => outbox().items;
export const rejectedCount = () => outbox().rejected;

export function enqueue(item: OutboxItem) {
  write({ ...outbox(), items: [...outbox().items, item] });
}

export function removeItem(item: OutboxItem) {
  write({ ...outbox(), items: outbox().items.filter((i) => i !== item) });
}

export function markRejected(item: OutboxItem) {
  write({ items: outbox().items.filter((i) => i !== item), rejected: outbox().rejected + 1 });
}

export function clearRejected() {
  write({ ...outbox(), rejected: 0 });
}

export function resetOutbox() {
  write({ items: [], rejected: 0 });
}

export function onOutboxChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
