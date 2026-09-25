// Shared shapes. These map 1:1 to the Supabase tables in supabase/migrations
// (snake_case columns there, camelCase here). backend.ts does the mapping.

export type Role = "guard" | "supervisor";

export interface User {
	id: string; // same as the Supabase Auth user id
	name: string;
	role: Role;
	email: string; // the sign-in identity
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
	// Phone and outbox: base64 data URLs. Server: object paths in the report-photos bucket.
	// Supervisor screens: short-lived signed URLs.
	photos: string[];
	createdAt: string;
}

/** What a guard's phone is allowed to cache. No manual codes, so they can't be read out of storage. */
export type PublicCheckpoint = Omit<Checkpoint, "manualCode">;

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

/** An account to create. Email is the sign-in identity. Role defaults to guard. */
export interface NewGuard {
	name: string;
	email: string;
	role?: Role;
}

/** An account as the supervisor's accounts screen lists it. */
export interface Account extends User {
	active: boolean; // false: can't sign in, and Row Level Security gives them nothing
}

/** A new guard account and its generated password. The password is only ever shown once. */
export interface CreatedGuard {
	user: User;
	password: string;
}

export interface GuardImportResult {
	created: CreatedGuard[];
	existing: string[]; // emails that already had an account, so were skipped
	failed: string[]; // emails the server could not create
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
	| {
			ok: true;
			queued: false;
			scan: Scan;
			checkpoint: PublicCheckpoint;
	  }
	| {
			ok: true;
			queued: true;
			scan: PendingScan;
			checkpoint: PublicCheckpoint | null;
	  }
	| {
			ok: false;
			reason: "unknown_code" | "inactive";
	  };
