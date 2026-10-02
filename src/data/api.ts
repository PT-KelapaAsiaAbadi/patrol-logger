/**
 * The only data module pages import.
 * It decides whether to talk to the backend (Supabase, via `backend.ts`) now or park work in the
 * offline outbox (`queue.ts`), and keeps small localStorage caches so the guard's screens work with
 * no signal. Supervisor functions need a connection and simply pass through to the backend.
 */
import * as backend from "./backend";
import * as outbox from "./queue";
import type { OutboxItem } from "./queue";
import { isOnline, onNetworkChange } from "./network";
import { newId } from "../lib/id";
import { localDateKey } from "../lib/format";
import { normalizePhone } from "../lib/phone";
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

// localStorage keys. The -v1 suffix lets a future change of shape start from a clean cache.
const SESSION_KEY = "patrol-session-v1"; // the signed-in user
const ROUTE_KEY = "patrol-route-v1"; // the checkpoints on the round
const TODAY_KEY = "patrol-today-v1"; // this guard's scans today

/** Reads a cached value. Returns null when it's missing, unreadable, or storage is blocked. */
const readJson = <T>(key: string): T | null => {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
};

/** Saves a cached value. Failures (storage full or blocked) are ignored: caches are optional. */
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

/** The signed-in user as last cached, or null. Reads storage only, so it works offline. */
export const currentUser = () => readJson<User>(SESSION_KEY);

/**
 * Signs in and caches the user. `phone` can be typed any common way ("0812-3456-7890", "+62 812...").
 * Returns null for a wrong number or password, or an inactive account.
 */
export async function signIn(
	phone: string,
	password: string,
): Promise<User | null> {
	const normalised = normalizePhone(phone);
	if (!normalised) return null; // can't be anyone's number: same answer as a wrong password
	const user = await backend.signIn(normalised, password);
	if (user) writeJson(SESSION_KEY, user);
	return user;
}

/** Clears the cached user and their today cache, so the next person on this phone starts clean. */
function forgetUser() {
	try {
		localStorage.removeItem(SESSION_KEY);
		localStorage.removeItem(TODAY_KEY);
	} catch {
		/* ignore */
	}
}

/**
 * Signs out straight away on this phone; the server sign-out finishes in the background.
 * The outbox is kept: unsent items go out when their guard signs in again.
 */
export function signOut() {
	forgetUser();
	void backend.signOut();
}

/** Calls `onEnd` when the Supabase session is gone, so the app can return to the login screen. */
export function onSessionEnd(onEnd: () => void): () => void {
	return backend.onSessionEnd(() => {
		if (!currentUser()) return; // already signed out here: nothing to do
		forgetUser();
		onEnd();
	});
}

// ---------- route (cached so the guard app works offline) ----------

/** The round's checkpoints: fresh from the server when online (and re-cached), else the cached copy. */
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
 * Offline best effort: read the checkpoint id out of a QR payload (`PTRL1:<id>:<signature>`) and
 * find it in the cached route. The signature is checked later by the server.
 * Manual codes can't be looked up here: guards never receive them (see ARCHITECTURE.md).
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

/** Shape of a typed manual code, e.g. "K7P-4QX" (dash optional). Only the server knows if it's real. */
const looksLikeManualCode = (code: string) =>
	/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/i.test(code.trim());

// ---------- today's visits (cached per guard for offline display) ----------

/** This guard's scans today, as the server last reported them. */
interface TodayCache {
	date: string; // local YYYY-MM-DD, so the cache resets at midnight
	guardId: string; // so another guard on the same phone never sees these
	scans: Scan[];
}

/** Adds a just-sent scan to today's cache, so the round ticks it off even if signal drops next. */
function rememberScan(saved: Scan) {
	const c = readJson<TodayCache>(TODAY_KEY);
	const today = localDateKey();
	// Only extend a cache that's for today and this guard; a stale one is replaced on the next load.
	if (c && c.date === today && c.guardId === saved.guardId) {
		if (!c.scans.some((s) => s.id === saved.id)) {
			writeJson(TODAY_KEY, { ...c, scans: [...c.scans, saved] });
		}
	}
}

/** The latest scan of one checkpoint today. */
export interface Visit {
	at: string; // when it was scanned (phone time, ISO)
	queued: boolean; // true while it's still waiting in the outbox
}

/** What the guard's round screen shows. */
export interface Progress {
	route: PublicCheckpoint[];
	visits: Record<string, Visit>; // by checkpoint id; missing = not visited yet today
	unmatchedPending: number; // queued manual codes, which can't be matched to a checkpoint offline
}

/**
 * Today's round for one guard: server scans (or the cached copy offline) plus scans still in
 * the outbox, so a scan made in a basement shows as done straight away.
 */
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

	// Keep the latest scan per checkpoint.
	const visits: Record<string, Visit> = {};
	for (const s of serverScans) {
		if (!visits[s.checkpointId] || visits[s.checkpointId].at < s.scannedAt)
			visits[s.checkpointId] = { at: s.scannedAt, queued: false };
	}

	// Add this guard's unsent scans. QR scans can be matched locally; manual codes only get counted.
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

/**
 * Records one scan. Sends it now when online; otherwise (or if the server can't be reached)
 * saves it in the outbox to send later. The id is made here, so a resend is never stored twice.
 *
 * @param code What the camera read (a QR payload) or what the guard typed (a manual code).
 * @param guardId The signed-in guard.
 * @param location The phone's position at the moment of scanning, if it had a fresh one.
 *
 * @returns `ok: true` with `queued: false` when the server saved it, or `queued: true` when it
 *   waits in the outbox. `ok: false` with a reason when it was refused: an unknown code, a
 *   checkpoint taken out of use (shown to the guard at once, so they can act) or a server error.
 */
export async function scan(
	code: string,
	guardId: string,
	location?: ScanLocation,
): Promise<ScanOutcome> {
	const pending: PendingScan = {
		id: newId(),
		guardId,
		code: code.trim(),
		scannedAt: new Date().toISOString(), // phone time: when the guard was really there
		...(location && { location }),
	};

	// Signal required to submit scan.
	if (isOnline()) {
		try {
			const r = await backend.submitScan(pending);
			if (!r.ok) return r; // unknown code or checkpoint out of use: the guard sees why right away
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

	// Offline: reject obvious junk now, while the guard is still standing at the sticker.
	const cp = localLookup(pending.code);
	if (!cp && !looksLikeManualCode(pending.code))
		return { ok: false, reason: "unknown_code" };
	outbox.enqueue({ kind: "scan", scan: pending });
	if (cp) recentNames.set(pending.id, cp.name);
	return { ok: true, queued: true, scan: pending, checkpoint: cp };
}

/**
 * Attaches a note and photos to a scan. Sends it now when possible, else queues it.
 * Photos stay as data URLs on the phone and in the outbox. backend.submitReport uploads them to
 * Storage when the report is sent, and the server keeps only the object paths.
 *
 * @returns "sent" when the server has it, "queued" when it waits in the outbox.
 */
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
	// A report can't reach the server before its scan does, so it queues behind it.
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
	// guardId is saved with the report so it's only sent while that guard is signed in.
	outbox.enqueue({ kind: "report", report, guardId: currentUser()?.id });
	return "queued";
}

// ---------- background sync ----------

/** The send in progress, if any. Callers share it, so two sends never run at once. */
let flushing: Promise<void> | null = null;

/**
 * Sends the signed-in guard's outbox items, oldest first. Stops at the first network failure.
 * Items another guard queued on this phone wait until that guard signs in again.
 *
 * Two kinds of refusal:
 *   - rejected: the server said the scan itself is invalid (e.g. unknown code). It's removed and
 *     counted, so the guard is told to scan those checkpoints again.
 *   - failed: the server errored. It stays with the error attached, for Try again or Discard.
 */
export function flushOutbox(): Promise<void> {
	if (flushing) return flushing;
	flushing = (async () => {
		const rejectedScanIds = new Set<string>();
		const otherGuardsScanIds = new Set<string>();
		const me = currentUser()?.id;

		// Iterate a copy: sending removes items from the outbox as it goes.
		for (const item of [...outbox.outboxItems()] as OutboxItem[]) {
			if (!isOnline()) break;

			// Another guard's scan, and any report on it, is sent under their own session later.
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
				// The server answered and refused: note why and move on, so one bad item
				// doesn't hold up the rest or pass itself off as "waiting for signal".
				if (e instanceof backend.ServerError) {
					console.error(
						"Queued item refused by the server",
						e.code,
						e.message,
					);
					outbox.markFailed(item, e.message);
					continue;
				}
				break; // network dropped again; try on the next tick
			}
		}
	})().finally(() => {
		flushing = null;
	});
	return flushing;
}

/**
 * Sends queued items whenever the phone comes back online, every 20 seconds in case that
 * moment was missed, and once now. Called once at start-up (main.tsx).
 */
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

/** The server's reason for refusing a request (e.g. "phone_exists"), or null if it wasn't reached. */
export const refusalCode = (e: unknown): string | null =>
	e instanceof backend.ServerError ? e.code : null;

/** Fails fast with Error("offline") instead of waiting for a request that can't succeed. */
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

export const changePhone = (userId: string, phone: string) =>
	needsNetwork(() => backend.changePhone(userId, phone));

export const allCheckpoints = () =>
	needsNetwork(() => backend.allCheckpoints());

export const createCheckpoint = (name: string, location: CheckpointLocation) =>
	needsNetwork(() => backend.createCheckpoint(name, location));

export const updateCheckpoint = (
	cp: Parameters<typeof backend.updateCheckpoint>[0],
) => needsNetwork(() => backend.updateCheckpoint(cp));

export const setCheckpointLocation = (
	id: string,
	location: CheckpointLocation,
) => needsNetwork(() => backend.setCheckpointLocation(id, location));

export const removeCheckpoints = (ids: string[]) =>
	needsNetwork(() => backend.removeCheckpoints(ids));

export const moveCheckpoint = (id: string, up: boolean) =>
	needsNetwork(() => backend.moveCheckpoint(id, up));

export const reissueCheckpoint = (id: string) =>
	needsNetwork(() => backend.reissueCheckpoint(id));

export const guardSummaries = (date: string) =>
	needsNetwork(() => backend.guardSummaries(date));

export const missedCheckpoints = (date: string) =>
	needsNetwork(() => backend.missedCheckpoints(date));

/** The signed text for a checkpoint's QR sticker. Not wrapped: the request fails by itself offline. */
export const qrPayloadFor = backend.qrPayloadFor;

// ---------- the guard's queued items ----------

/** Whether an outbox item belongs to this guard. Reports queued without a guardId count as theirs. */
const isMine = (i: OutboxItem, guardId: string) =>
	i.kind === "scan"
		? i.scan.guardId === guardId
		: (i.guardId ?? guardId) === guardId;

/** This guard's queued items that the server refused last time it was asked. */
export const failedItems = (guardId: string) =>
	outbox.outboxItems().filter((i) => i.error && isMine(i, guardId));

/** Tries the refused items again (e.g. after a supervisor fixed the account). */
export function retryFailed(): Promise<void> {
	outbox.clearErrors();
	return flushOutbox();
}

/** Removes this guard's refused items from the phone for good. */
export function discardFailed(guardId: string) {
	outbox.removeItems((i) => !!i.error && isMine(i, guardId));
}

/** Scans and reports this guard has queued on this phone and not yet sent. */
export const unsentCount = (guardId: string) =>
	outbox
		.outboxItems()
		.filter((i) =>
			i.kind === "scan"
				? i.scan.guardId === guardId
				: (i.guardId ?? guardId) === guardId,
		).length;

// Outbox reads for the screens, passed straight through so pages still import only this file.
export {
	loadOutbox,
	outboxItems,
	rejectedCount,
	clearRejected,
	onOutboxChange,
} from "./queue";

// ---------- shifts (supervisor, online only) ----------

export const listShifts = (from: string, to: string) =>
	needsNetwork(() => backend.listShifts(from, to));

export const assignShift = (
	guardId: string,
	startsAt: string,
	endsAt: string,
) => needsNetwork(() => backend.assignShift(guardId, startsAt, endsAt));

export const removeShift = (id: string) =>
	needsNetwork(() => backend.removeShift(id));

export const copyShifts = (from: string, to: string) =>
	needsNetwork(() => backend.copyShifts(from, to));
