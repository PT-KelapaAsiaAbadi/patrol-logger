/**
 * MOCK BACKEND
 * ------------
 * Everything in this file is what Supabase will do for real:
 *   - `db` object        -> Postgres tables (users, checkpoints, scans, reports)
 *   - signIn             -> Supabase Auth
 *   - submitScan         -> an Edge Function that verifies the QR signature, then inserts
 *   - listScans          -> supabase.from('scans_view').select('*', { count: 'exact' }).range(from, to)
 *   - Row Level Security -> the role checks marked "RLS" below
 *
 * The UI never imports this file directly. It goes through `api.ts`,
 * so swapping this file for Supabase calls doesn't touch any page.
 *
 * The secret below exists only because this prototype has no server.
 * In production it lives in the Edge Function's environment and never ships to phones.
 */
import type {
  Checkpoint, GuardSummary, Page, PendingScan, PublicCheckpoint,
  Report, Scan, ScanQuery, ScanRow, User,
} from '../types';
import { localDateKey } from '../lib/format';

const DEMO_SECRET = 'prototype-only-secret-do-not-ship';
const STORAGE_KEY = 'patrol-demo-db-v1';

interface Db {
  users: (User & { pin: string })[];
  checkpoints: Checkpoint[];
  scans: Scan[];
  reports: Report[];
}

// ---------- persistence (stand-in for Postgres) ----------

let memory: Db | null = null;

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch { /* storage blocked or corrupt: fall through to a fresh seed */ }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(d: Db) {
  memory = d;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* quota or blocked: keep in memory only */ }
}

const db = (): Db => (memory ??= load());

export function resetDemoData() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  memory = null;
}

/** Fake network delay so loading states are visible in the prototype. */
const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180));

// ---------- QR signing (Edge Function in production) ----------

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(DEMO_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  // base64url, first 16 chars (96 bits) is plenty for a sticker
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 16);
}

/** What gets encoded into each checkpoint's QR sticker: PTRL1:<id>:<signature> */
export async function qrPayloadFor(checkpointId: string): Promise<string> {
  return `PTRL1:${checkpointId}:${await hmac(checkpointId)}`;
}

/** Server-side check. Accepts either a signed QR payload or a printed manual code. */
async function resolveCode(code: string): Promise<Checkpoint | null> {
  const trimmed = code.trim();
  const parts = trimmed.split(':');
  if (parts.length === 3 && parts[0] === 'PTRL1') {
    const [, id, sig] = parts;
    if ((await hmac(id)) !== sig) return null; // forged or damaged
    return db().checkpoints.find((c) => c.id === id) ?? null;
  }
  const manual = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return db().checkpoints.find((c) => c.manualCode.replace('-', '') === manual) ?? null;
}

// ---------- auth ----------

export async function signIn(staffCode: string, pin: string): Promise<User | null> {
  await latency();
  const u = db().users.find((x) => x.staffCode.toLowerCase() === staffCode.trim().toLowerCase() && x.pin === pin);
  if (!u) return null;
  const { pin: _pin, ...user } = u;
  return user;
}

/** Prototype only: lets the login screen offer one-tap demo accounts. */
export function demoAccounts(): { user: User; pin: string }[] {
  return db().users.map(({ pin, ...user }) => ({ user, pin }));
}

// ---------- guard-facing ----------

export async function publicCheckpoints(): Promise<PublicCheckpoint[]> {
  await latency();
  return db().checkpoints
    .filter((c) => c.active)
    .sort((a, b) => a.routeOrder - b.routeOrder)
    .map(({ manualCode: _m, ...pub }) => pub);
}

export type SubmitResult =
  | { ok: true; scan: Scan; checkpoint: PublicCheckpoint }
  | { ok: false; reason: 'unknown_code' | 'inactive' };

/** Idempotent: sending the same scan id twice returns the first result. */
export async function submitScan(pending: PendingScan): Promise<SubmitResult> {
  await latency();
  const cp = await resolveCode(pending.code);
  if (!cp) return { ok: false, reason: 'unknown_code' };
  if (!cp.active) return { ok: false, reason: 'inactive' };

  const d = db();
  const { manualCode: _m, ...pub } = cp;
  const existing = d.scans.find((s) => s.id === pending.id);
  if (existing) return { ok: true, scan: existing, checkpoint: pub };

  const scan: Scan = {
    id: pending.id,
    checkpointId: cp.id,
    guardId: pending.guardId,
    scannedAt: pending.scannedAt,
    receivedAt: new Date().toISOString(),
  };
  d.scans.push(scan);
  save(d);
  return { ok: true, scan, checkpoint: pub };
}

export async function submitReport(report: Report): Promise<void> {
  await latency();
  const d = db();
  if (!d.scans.some((s) => s.id === report.scanId)) throw new Error('scan_not_synced');
  if (d.reports.some((r) => r.id === report.id)) return; // already stored
  d.reports.push(report);
  save(d);
}

/** RLS: a guard can only read their own scans. */
export async function scansForGuardOnDate(guardId: string, date: string): Promise<Scan[]> {
  await latency();
  return db().scans.filter((s) => s.guardId === guardId && localDateKey(s.scannedAt) === date);
}

// ---------- supervisor-facing (RLS: role = supervisor) ----------

export async function listGuards(): Promise<User[]> {
  await latency();
  return db().users.filter((u) => u.role === 'guard').map(({ pin: _p, ...u }) => u);
}

export async function allCheckpoints(): Promise<Checkpoint[]> {
  await latency();
  return [...db().checkpoints].sort((a, b) => a.routeOrder - b.routeOrder);
}

function toRow(s: Scan): ScanRow {
  const d = db();
  return {
    ...s,
    guardName: d.users.find((u) => u.id === s.guardId)?.name ?? 'Unknown',
    checkpointName: d.checkpoints.find((c) => c.id === s.checkpointId)?.name ?? 'Unknown',
    report: d.reports.find((r) => r.scanId === s.id) ?? null,
  };
}

function filtered(q: Omit<ScanQuery, 'page' | 'pageSize'>): Scan[] {
  return db().scans
    .filter((s) => (!q.guardId || s.guardId === q.guardId)
      && (!q.checkpointId || s.checkpointId === q.checkpointId)
      && (!q.date || localDateKey(s.scannedAt) === q.date))
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
}

/** Server-side pagination. Same contract as Supabase `.range()` with `count: 'exact'`. */
export async function listScans(q: ScanQuery): Promise<Page<ScanRow>> {
  await latency();
  const all = filtered(q);
  const from = (q.page - 1) * q.pageSize;
  return { rows: all.slice(from, from + q.pageSize).map(toRow), total: all.length, page: q.page, pageSize: q.pageSize };
}

export async function exportScans(q: Omit<ScanQuery, 'page' | 'pageSize'>): Promise<ScanRow[]> {
  await latency();
  return filtered(q).map(toRow);
}

export async function getScan(id: string): Promise<ScanRow | null> {
  await latency();
  const s = db().scans.find((x) => x.id === id);
  return s ? toRow(s) : null;
}

export async function guardSummaries(date: string): Promise<GuardSummary[]> {
  await latency();
  const d = db();
  return d.users.filter((u) => u.role === 'guard').map((g) => {
    const mine = d.scans
      .filter((s) => s.guardId === g.id && localDateKey(s.scannedAt) === date)
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
    return { guardId: g.id, guardName: g.name, scansToday: mine.length, lastScanAt: mine[0]?.scannedAt ?? null };
  });
}

export async function missedCheckpoints(date: string): Promise<Checkpoint[]> {
  await latency();
  const d = db();
  const visited = new Set(d.scans.filter((s) => localDateKey(s.scannedAt) === date).map((s) => s.checkpointId));
  return d.checkpoints.filter((c) => c.active && !visited.has(c.id)).sort((a, b) => a.routeOrder - b.routeOrder);
}

// ---------- seed data ----------

function seed(): Db {
  // Small seeded PRNG so every fresh demo looks the same.
  let x = 20260923;
  const rand = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rand() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I, easier to read off a sticker
  const code = () => Array.from({ length: 6 }, (_, i) => (i === 3 ? '-' : '') + alphabet[Math.floor(rand() * alphabet.length)]).join('');

  const users: Db['users'] = [
    { id: uuid(), name: 'Budi Santoso', role: 'guard', staffCode: 'budi', pin: '1234' },
    { id: uuid(), name: 'Agus Pratama', role: 'guard', staffCode: 'agus', pin: '1234' },
    { id: uuid(), name: 'Dewi Lestari', role: 'guard', staffCode: 'dewi', pin: '1234' },
    { id: uuid(), name: 'Rina Wijaya', role: 'supervisor', staffCode: 'rina', pin: '5678' },
  ];

  const names = ['Lobi utama', 'Pintu samping timur', 'Parkir basement B1', 'Ruang panel listrik',
    'Tangga darurat lantai 2', 'Gudang belakang', 'Atap dan tandon air', 'Pos jaga gerbang'];
  const checkpoints: Checkpoint[] = names.map((name, i) => ({
    id: uuid(), name, routeOrder: i + 1, manualCode: code(), active: true,
  }));

  // A few days of history so the supervisor log has several pages.
  const scans: Scan[] = [];
  const guards = users.filter((u) => u.role === 'guard');
  const now = new Date();
  for (let day = 3; day >= 1; day--) {
    for (const [gi, g] of guards.entries()) {
      for (let round = 0; round < 2; round++) {
        const start = new Date(now);
        start.setDate(now.getDate() - day);
        start.setHours(7 + gi * 5 + round * 2, Math.floor(rand() * 20), 0, 0);
        let t = start.getTime();
        for (const cp of checkpoints) {
          if (rand() < 0.12) continue; // a skipped checkpoint now and then
          t += (4 + rand() * 6) * 60_000;
          const at = new Date(t).toISOString();
          scans.push({ id: uuid(), checkpointId: cp.id, guardId: g.id, scannedAt: at, receivedAt: at });
        }
      }
    }
  }
  // Today: Agus and Dewi are part-way through a round. Budi (the demo guard) starts fresh.
  for (const [gi, g] of guards.slice(1).entries()) {
    let t = now.getTime() - (70 - gi * 25) * 60_000;
    for (const cp of checkpoints.slice(0, 5 - gi * 2)) {
      t += 7 * 60_000;
      if (t > now.getTime()) break;
      const at = new Date(t).toISOString();
      scans.push({ id: uuid(), checkpointId: cp.id, guardId: g.id, scannedAt: at, receivedAt: at });
    }
  }

  const reports: Report[] = [];
  const notes = ['Pintu darurat tidak terkunci, sudah dikunci kembali.', 'Lampu koridor mati, perlu diganti.',
    'Ada kendaraan parkir di jalur evakuasi.', 'Genangan air di dekat panel, sudah dilaporkan ke teknisi.'];
  for (const note of notes) {
    const s = scans[Math.floor(rand() * scans.length)];
    reports.push({ id: uuid(), scanId: s.id, note, photos: [], createdAt: s.scannedAt });
  }

  return { users, checkpoints, scans, reports };
}
