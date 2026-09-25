/**
 * The only data module pages import.
 * It decides whether to talk to the backend now or park work in the offline outbox.
 * When you move to Supabase, `backend.ts` changes; this file and the pages mostly don't.
 */
import * as backend from "./backend";
import * as outbox from "./queue";
import type { OutboxItem } from "./queue";
import { isOnline, onNetworkChange } from "./network";
import { newId } from "../lib/id";
import { localDateKey } from "../lib/format";
import type {
	CheckpointLocation,
	NewGuard,
	PendingScan,
	PublicCheckpoint,
	Report,
	Scan,
	ScanOutcome,
	ScanLocation,
	ScanQuery,
	User,
} from "../types";

const SESSION_KEY = "patrol-session-v1";
const ROUTE_KEY = "patrol-route-v1";
const TODAY_KEY = "patrol-today-v1";

const readJson = <T>(key: string): T | null => {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
};

const writeJson = (key: string, v: unknown) => {
	try {
		localStorage.setItem(key, JSON.stringify(v));
	} catch {
		/* ignore */
	}
};

// ---------- session ----------
// Supabase keeps the real session (and refreshes it). This cached copy of the user is only for
// picking screens and showing a name, including offline. Editing it in DevTools gains nothing:
// every read and write is checked against the session's user by Row Level Security.

export const currentUser = () => readJson<User>(SESSION_KEY);

export async function signIn(
	email: string,
	password: string,
): Promise<User | null> {
	const user = await backend.signIn(email, password);
	if (user) writeJson(SESSION_KEY, user);
	return user;
}

function forgetUser() {
	try {
		localStorage.removeItem(SESSION_KEY);
		localStorage.removeItem(TODAY_KEY);
	} catch {
		/* ignore */
	}
}

export function signOut() {
	forgetUser();
	void backend.signOut();
}

/** Calls `onEnd` when the Supabase session is gone, so the app can return to the login screen. */
export function onSessionEnd(onEnd: () => void): () => void {
	return backend.onSessionEnd(() => {
		if (!currentUser()) return;
		forgetUser();
		onEnd();
	});
}

// ---------- route (cached so the guard app works offline) ----------

export async function loadRoute(): Promise<PublicCheckpoint[]> {
	if (isOnline()) {
		try {
			const route = await backend.publicCheckpoints();
			writeJson(ROUTE_KEY, route);
			return route;
		} catch {
			/* fall back to cache */
		}
	}
	return readJson<PublicCheckpoint[]>(ROUTE_KEY) ?? [];
}

/**
 * Offline best effort: read the checkpoint id out of a QR payload. The signature is checked later by the server.
 *
 */
function localLookup(code: string): PublicCheckpoint | null {
	const [prefix, id] = code.trim().split(":");
	if (prefix !== "PTRL1" || !id) return null;
	return (
		(readJson<PublicCheckpoint[]>(ROUTE_KEY) ?? []).find(
			(c) => c.id === id,
		) ?? null
	);
}

const looksLikeManualCode = (code: string) =>
	/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/i.test(code.trim());

// ---------- today's visits (cached per guard for offline display) ----------

interface TodayCache {
	date: string;
	guardId: string;
	scans: Scan[];
}

function rememberScan(saved: Scan) {
	const c = readJson<TodayCache>(TODAY_KEY);
	const today = localDateKey();
	if (c && c.date === today && c.guardId === saved.guardId) {
		if (!c.scans.some((s) => s.id === saved.id))
			writeJson(TODAY_KEY, { ...c, scans: [...c.scans, saved] });
	}
}

export interface Visit {
	at: string;
	queued: boolean;
}
export interface Progress {
	route: PublicCheckpoint[];
	visits: Record<string, Visit>;
	unmatchedPending: number;
}

export async function todayProgress(guardId: string): Promise<Progress> {
	const today = localDateKey();
	const route = await loadRoute();

	let serverScans: Scan[] = [];
	if (isOnline()) {
		try {
			serverScans = await backend.scansForGuardOnDate(guardId, today);
			writeJson(TODAY_KEY, {
				date: today,
				guardId,
				scans: serverScans,
			} satisfies TodayCache);
		} catch {
			serverScans = [];
		}
	} else {
		const c = readJson<TodayCache>(TODAY_KEY);
		if (c && c.date === today && c.guardId === guardId)
			serverScans = c.scans;
	}

	const visits: Record<string, Visit> = {};
	for (const s of serverScans) {
		if (!visits[s.checkpointId] || visits[s.checkpointId].at < s.scannedAt)
			visits[s.checkpointId] = { at: s.scannedAt, queued: false };
	}

	let unmatchedPending = 0;
	for (const item of outbox.outboxItems()) {
		if (item.kind !== "scan" || item.scan.guardId !== guardId) continue;
		const cp = localLookup(item.scan.code);
		if (!cp) {
			unmatchedPending++;
			continue;
		}
		if (!visits[cp.id] || visits[cp.id].at < item.scan.scannedAt)
			visits[cp.id] = { at: item.scan.scannedAt, queued: true };
	}

	return { route, visits, unmatchedPending };
}

// ---------- scanning ----------

/** Checkpoint names for scans made this session, so the report screen can show where it is. */
const recentNames = new Map<string, string>();
export const checkpointNameForScan = (scanId: string) =>
	recentNames.get(scanId) ?? null;

/** `location` is the phone's position at the moment of scanning, if it had a fresh one. */
export async function scan(
	code: string,
	guardId: string,
	location?: ScanLocation,
): Promise<ScanOutcome> {
	const pending: PendingScan = {
		id: newId(),
		guardId,
		code: code.trim(),
		scannedAt: new Date().toISOString(),
		...(location && { location }),
	};

	if (isOnline()) {
		try {
			const r = await backend.submitScan(pending);
			if (!r.ok) return r;
			rememberScan(r.scan);
			recentNames.set(r.scan.id, r.checkpoint.name);
			return {
				ok: true,
				queued: false,
				scan: r.scan,
				checkpoint: r.checkpoint,
			};
		} catch (e) {
			// The server answered and refused: queuing it would only claim "no signal" forever.
			if (e instanceof backend.ServerError) {
				console.error("Scan refused by the server", e.code, e.message);
				return { ok: false, reason: "server_error" };
			}
			/* the server wasn't reached: keep it in the outbox instead of losing it */
		}
	}

	const cp = localLookup(pending.code);
	if (!cp && !looksLikeManualCode(pending.code))
		return { ok: false, reason: "unknown_code" };
	outbox.enqueue({ kind: "scan", scan: pending });
	if (cp) recentNames.set(pending.id, cp.name);
	return { ok: true, queued: true, scan: pending, checkpoint: cp };
}

// Photos stay as data URLs on the phone and in the outbox. backend.submitReport uploads them to
// Storage when the report is sent, and the server keeps only the object paths.
export async function addReport(
	scanId: string,
	note: string,
	photos: string[],
): Promise<"sent" | "queued"> {
	const report: Report = {
		id: newId(),
		scanId,
		note: note.trim(),
		photos,
		createdAt: new Date().toISOString(),
	};
	const scanStillQueued = outbox
		.outboxItems()
		.some((i) => i.kind === "scan" && i.scan.id === scanId);
	if (isOnline() && !scanStillQueued) {
		try {
			await backend.submitReport(report);
			return "sent";
		} catch {
			/* fall through */
		}
	}
	outbox.enqueue({ kind: "report", report, guardId: currentUser()?.id });
	return "queued";
}

// ---------- background sync ----------

let flushing: Promise<void> | null = null;

/**
 * Sends the signed-in guard's outbox items, oldest first. Stops at the first network failure.
 * Items another guard queued on this phone wait until that guard signs in again.
 */
export function flushOutbox(): Promise<void> {
	if (flushing) return flushing;
	flushing = (async () => {
		const rejectedScanIds = new Set<string>();
		const otherGuardsScanIds = new Set<string>();
		const me = currentUser()?.id;

		for (const item of [...outbox.outboxItems()] as OutboxItem[]) {
			if (!isOnline()) break;

			if (item.kind === "scan" && item.scan.guardId !== me) {
				otherGuardsScanIds.add(item.scan.id);
				continue;
			}
			if (
				item.kind === "report" &&
				((item.guardId && item.guardId !== me) ||
					otherGuardsScanIds.has(item.report.scanId))
			) {
				continue;
			}

			try {
				if (item.kind === "scan") {
					const r = await backend.submitScan(item.scan);
					if (r.ok) {
						rememberScan(r.scan);
						outbox.removeItem(item);
					} else {
						rejectedScanIds.add(item.scan.id);
						outbox.markRejected(item);
					}
				} else if (rejectedScanIds.has(item.report.scanId)) {
					outbox.removeItem(item); // its scan was rejected, so the report has nothing to attach to
				} else {
					await backend.submitReport(item.report);
					outbox.removeItem(item);
				}
			} catch (e) {
				// A report on a scan another guard already sent: the server refuses it for this
				// guard, so leave it for its owner rather than blocking everything behind it.
				if (e instanceof Error && e.message === "not_allowed") continue;
				break; // network dropped again; try on the next tick
			}
		}
	})().finally(() => {
		flushing = null;
	});
	return flushing;
}

export function startAutoSync() {
	const tick = () => {
		if (isOnline() && outbox.outboxItems().length) {
			void flushOutbox();
		}
	};
	onNetworkChange(tick);
	setInterval(tick, 20_000);
	tick();
}

// ---------- supervisor ----------
// These need a connection; the dashboard is used at a desk, not on patrol.

async function needsNetwork<T>(fn: () => Promise<T>): Promise<T> {
	if (!isOnline()) throw new Error("offline");
	return fn();
}

export const listScans = (q: ScanQuery) =>
	needsNetwork(() => backend.listScans(q));

export const exportScans = (q: Omit<ScanQuery, "page" | "pageSize">) =>
	needsNetwork(() => backend.exportScans(q));

export const getScan = (id: string) => needsNetwork(() => backend.getScan(id));

export const listGuards = () => needsNetwork(() => backend.listGuards());

export const listAccounts = () => needsNetwork(() => backend.listAccounts());

export const setAccountActive = (id: string, active: boolean) =>
	needsNetwork(() => backend.setAccountActive(id, active));

export const resetPassword = (userId: string) =>
	needsNetwork(() => backend.resetPassword(userId));

export const createGuards = (guards: NewGuard[]) =>
	needsNetwork(() => backend.createGuards(guards));

export const allCheckpoints = () =>
	needsNetwork(() => backend.allCheckpoints());

export const createCheckpoint = (name: string) =>
	needsNetwork(() => backend.createCheckpoint(name));

export const updateCheckpoint = (
	cp: Parameters<typeof backend.updateCheckpoint>[0],
) => needsNetwork(() => backend.updateCheckpoint(cp));

export const setCheckpointLocation = (
	id: string,
	location: CheckpointLocation | null,
) => needsNetwork(() => backend.setCheckpointLocation(id, location));

export const moveCheckpoint = (id: string, up: boolean) =>
	needsNetwork(() => backend.moveCheckpoint(id, up));

export const reissueCheckpoint = (id: string) =>
	needsNetwork(() => backend.reissueCheckpoint(id));

export const guardSummaries = (date: string) =>
	needsNetwork(() => backend.guardSummaries(date));

export const missedCheckpoints = (date: string) =>
	needsNetwork(() => backend.missedCheckpoints(date));

export const qrPayloadFor = backend.qrPayloadFor;

/** Scans and reports this guard has queued on this phone and not yet sent. */
export const unsentCount = (guardId: string) =>
	outbox
		.outboxItems()
		.filter((i) =>
			i.kind === "scan"
				? i.scan.guardId === guardId
				: (i.guardId ?? guardId) === guardId,
		).length;

export {
	loadOutbox,
	outboxItems,
	rejectedCount,
	clearRejected,
	onOutboxChange,
} from "./queue";
