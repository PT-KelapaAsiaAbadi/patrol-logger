/**
 * The only data module pages import.
 * It decides whether to talk to the backend now or park work in the offline outbox.
 * When you move to Supabase, `backend.ts` changes; this file and the pages mostly don't.
 */
import * as backend from './backend';
import * as outbox from './queue';
import type { OutboxItem } from './queue';
import { isOnline, onNetworkChange } from './network';
import { newId } from '../lib/id';
import { localDateKey } from '../lib/format';
import type { PendingScan, PublicCheckpoint, Report, Scan, ScanOutcome, ScanQuery, User } from '../types';

const SESSION_KEY = 'patrol-session-v1';
const ROUTE_KEY = 'patrol-route-v1';
const TODAY_KEY = 'patrol-today-v1';

const readJson = <T,>(key: string): T | null => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
};
const writeJson = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
};

// ---------- session ----------
// Production: supabase.auth.signInWithPassword / getSession. Supabase keeps the session for you.

export const currentUser = () => readJson<User>(SESSION_KEY);

export async function signIn(staffCode: string, pin: string): Promise<User | null> {
  const user = await backend.signIn(staffCode, pin);
  if (user) writeJson(SESSION_KEY, user);
  return user;
}

export function signOut() {
  try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(TODAY_KEY); } catch { /* ignore */ }
}

export const demoAccounts = backend.demoAccounts;

// ---------- route (cached so the guard app works offline) ----------

export async function loadRoute(): Promise<PublicCheckpoint[]> {
  if (isOnline()) {
    try {
      const route = await backend.publicCheckpoints();
      writeJson(ROUTE_KEY, route);
      return route;
    } catch { /* fall back to cache */ }
  }
  return readJson<PublicCheckpoint[]>(ROUTE_KEY) ?? [];
}

/** Offline best effort: read the checkpoint id out of a QR payload. The signature is checked later by the server. */
function localLookup(code: string): PublicCheckpoint | null {
  const [prefix, id] = code.trim().split(':');
  if (prefix !== 'PTRL1' || !id) return null;
  return (readJson<PublicCheckpoint[]>(ROUTE_KEY) ?? []).find((c) => c.id === id) ?? null;
}

const looksLikeManualCode = (code: string) => /^[A-Z0-9]{3}-?[A-Z0-9]{3}$/i.test(code.trim());

// ---------- today's visits (cached per guard for offline display) ----------

interface TodayCache { date: string; guardId: string; scans: Scan[] }

function rememberScan(scan: Scan) {
  const c = readJson<TodayCache>(TODAY_KEY);
  const today = localDateKey();
  if (c && c.date === today && c.guardId === scan.guardId) {
    if (!c.scans.some((s) => s.id === scan.id)) writeJson(TODAY_KEY, { ...c, scans: [...c.scans, scan] });
  }
}

export interface Visit { at: string; queued: boolean }
export interface Progress { route: PublicCheckpoint[]; visits: Record<string, Visit>; unmatchedPending: number }

export async function todayProgress(guardId: string): Promise<Progress> {
  const today = localDateKey();
  const route = await loadRoute();

  let serverScans: Scan[] = [];
  if (isOnline()) {
    try {
      serverScans = await backend.scansForGuardOnDate(guardId, today);
      writeJson(TODAY_KEY, { date: today, guardId, scans: serverScans } satisfies TodayCache);
    } catch { serverScans = [] }
  } else {
    const c = readJson<TodayCache>(TODAY_KEY);
    if (c && c.date === today && c.guardId === guardId) serverScans = c.scans;
  }

  const visits: Record<string, Visit> = {};
  for (const s of serverScans) {
    if (!visits[s.checkpointId] || visits[s.checkpointId].at < s.scannedAt) visits[s.checkpointId] = { at: s.scannedAt, queued: false };
  }

  let unmatchedPending = 0;
  for (const item of outbox.outboxItems()) {
    if (item.kind !== 'scan' || item.scan.guardId !== guardId) continue;
    const cp = localLookup(item.scan.code);
    if (!cp) { unmatchedPending++; continue; }
    if (!visits[cp.id] || visits[cp.id].at < item.scan.scannedAt) visits[cp.id] = { at: item.scan.scannedAt, queued: true };
  }

  return { route, visits, unmatchedPending };
}

// ---------- scanning ----------

/** Checkpoint names for scans made this session, so the report screen can show where it is. */
const recentNames = new Map<string, string>();
export const checkpointNameForScan = (scanId: string) => recentNames.get(scanId) ?? null;

export async function scan(code: string, guardId: string): Promise<ScanOutcome> {
  const pending: PendingScan = { id: newId(), guardId, code: code.trim(), scannedAt: new Date().toISOString() };

  if (isOnline()) {
    try {
      const r = await backend.submitScan(pending);
      if (!r.ok) return r;
      rememberScan(r.scan);
      recentNames.set(r.scan.id, r.checkpoint.name);
      return { ok: true, queued: false, scan: r.scan, checkpoint: r.checkpoint };
    } catch { /* request failed mid-way: keep it in the outbox instead of losing it */ }
  }

  const cp = localLookup(pending.code);
  if (!cp && !looksLikeManualCode(pending.code)) return { ok: false, reason: 'unknown_code' };
  outbox.enqueue({ kind: 'scan', scan: pending });
  if (cp) recentNames.set(pending.id, cp.name);
  return { ok: true, queued: true, scan: pending, checkpoint: cp };
}

export async function addReport(scanId: string, note: string, photos: string[]): Promise<'sent' | 'queued'> {
  const report: Report = { id: newId(), scanId, note: note.trim(), photos, createdAt: new Date().toISOString() };
  const scanStillQueued = outbox.outboxItems().some((i) => i.kind === 'scan' && i.scan.id === scanId);
  if (isOnline() && !scanStillQueued) {
    try { await backend.submitReport(report); return 'sent'; } catch { /* fall through */ }
  }
  outbox.enqueue({ kind: 'report', report });
  return 'queued';
}

// ---------- background sync ----------

let flushing: Promise<void> | null = null;

/** Sends everything in the outbox, oldest first. Stops at the first network failure. */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const rejectedScanIds = new Set<string>();
    for (const item of [...outbox.outboxItems()] as OutboxItem[]) {
      if (!isOnline()) break;
      try {
        if (item.kind === 'scan') {
          const r = await backend.submitScan(item.scan);
          if (r.ok) { rememberScan(r.scan); outbox.removeItem(item); }
          else { rejectedScanIds.add(item.scan.id); outbox.markRejected(item); }
        } else if (rejectedScanIds.has(item.report.scanId)) {
          outbox.removeItem(item); // its scan was rejected, so the report has nothing to attach to
        } else {
          await backend.submitReport(item.report);
          outbox.removeItem(item);
        }
      } catch {
        break; // network dropped again; try on the next tick
      }
    }
  })().finally(() => { flushing = null; });
  return flushing;
}

export function startAutoSync() {
  const tick = () => { if (isOnline() && outbox.outboxItems().length) void flushOutbox(); };
  onNetworkChange(tick);
  setInterval(tick, 20_000);
  tick();
}

// ---------- supervisor ----------
// These need a connection; the dashboard is used at a desk, not on patrol.

async function needsNetwork<T>(fn: () => Promise<T>): Promise<T> {
  if (!isOnline()) throw new Error('offline');
  return fn();
}

export const listScans = (q: ScanQuery) => needsNetwork(() => backend.listScans(q));
export const exportScans = (q: Omit<ScanQuery, 'page' | 'pageSize'>) => needsNetwork(() => backend.exportScans(q));
export const getScan = (id: string) => needsNetwork(() => backend.getScan(id));
export const listGuards = () => needsNetwork(() => backend.listGuards());
export const allCheckpoints = () => needsNetwork(() => backend.allCheckpoints());
export const guardSummaries = (date: string) => needsNetwork(() => backend.guardSummaries(date));
export const missedCheckpoints = (date: string) => needsNetwork(() => backend.missedCheckpoints(date));
export const qrPayloadFor = backend.qrPayloadFor;

// ---------- prototype controls ----------

export function resetEverything() {
  backend.resetDemoData();
  outbox.resetOutbox();
  try { [SESSION_KEY, ROUTE_KEY, TODAY_KEY].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

export { outboxItems, rejectedCount, clearRejected, onOutboxChange } from './queue';
