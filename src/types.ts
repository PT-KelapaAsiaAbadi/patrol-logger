// Shared shapes. These map 1:1 to the Supabase tables you will create later
// (snake_case columns there, camelCase here).

export type Role = 'guard' | 'supervisor';

export interface User {
  id: string;
  name: string;
  role: Role;
  staffCode: string;
}

export interface Checkpoint {
  id: string; // uuid, never shown to guards
  name: string;
  routeOrder: number; // position in the patrol round
  manualCode: string; // short random code printed under the QR, for when the camera fails
  active: boolean;
}

export interface Scan {
  id: string; // generated on the phone so a retried upload can't create duplicates
  checkpointId: string;
  guardId: string;
  scannedAt: string; // ISO, device clock at the moment of scanning
  receivedAt: string; // ISO, server clock when the scan arrived
}

export interface Report {
  id: string;
  scanId: string;
  note: string;
  photos: string[]; // data URLs in the prototype; Storage object paths in production
  createdAt: string;
}

/** What a guard's phone is allowed to cache. No manual codes, so they can't be read out of storage. */
export type PublicCheckpoint = Omit<Checkpoint, 'manualCode'>;

/** A scan joined with names, as the supervisor table shows it. */
export interface ScanRow extends Scan {
  guardName: string;
  checkpointName: string;
  report: Report | null;
}

export interface ScanQuery {
  page: number; // 1-based
  pageSize: number;
  guardId?: string;
  checkpointId?: string;
  date?: string; // YYYY-MM-DD, local time
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface GuardSummary {
  guardId: string;
  guardName: string;
  scansToday: number;
  lastScanAt: string | null;
}

/** A scan the phone saved while offline. The server checks `code` when it syncs. */
export interface PendingScan {
  id: string;
  guardId: string;
  code: string; // raw QR payload or manual code
  scannedAt: string;
}

/** Result of scanning a QR code or typing a manual code. */
export type ScanOutcome =
  | { ok: true; queued: false; scan: Scan; checkpoint: PublicCheckpoint }
  | { ok: true; queued: true; scan: PendingScan; checkpoint: PublicCheckpoint | null }
  | { ok: false; reason: 'unknown_code' | 'inactive' };
