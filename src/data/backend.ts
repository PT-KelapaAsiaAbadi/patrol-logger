/**
 * BACKEND (Supabase)
 * ------------------
 *   - signIn / signOut   -> Supabase Auth (phone number + password)
 *   - reads              -> tables and the scan_rows view, filtered by Row Level Security
 *   - writes             -> SECURITY DEFINER functions that check the caller (supabase/migrations)
 *   - createGuards       -> the create-guards Edge Function (needs the service-role key)
 *   - phone numbers      -> the staff-phone Edge Function (change a number)
 *   - report photos      -> the private report-photos Storage bucket
 *
 * The UI never imports this file directly. It goes through `api.ts`.
 * Database rows are snake_case; everything returned from here is the camelCase shape in types.ts.
 */
import type {
	Account,
	Checkpoint,
	CheckpointLocation,
	LocationStatus,
	GuardImportResult,
	GuardSummary,
	NewGuard,
	Page,
	PendingScan,
	PublicCheckpoint,
	Report,
	Role,
	Scan,
	ScanQuery,
	ScanRow,
	User,
} from "../types";
import type { Tables } from "../../database.types";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

const PHOTO_BUCKET = "report-photos"; // private: photos are only shown through signed URLs
const SIGNED_URL_SECONDS = 60 * 60; // a signed photo link works for an hour, then expires
const EXPORT_BATCH = 1000; // PostgREST's default maximum rows per request

// ---------- mapping ----------
// Each to* function turns one database row (snake_case) into the app's shape (camelCase, types.ts).

/** Postgres returns "+00:00" and microseconds; the app compares ISO strings, so normalise them. */
const iso = (t: string) => new Date(t).toISOString();

// Row shapes, taken from the generated database types so a schema change shows up as a type error.
type ProfileRow = Pick<Tables<"profiles">, "id" | "name" | "role" | "phone">;
type ScanRecord = Tables<"scans">;
type ReportRecord = Omit<Tables<"reports">, "created_at"> & {
	created_at: string;
};
type CheckpointRecord = Tables<"checkpoints">;
/** What guards may see of a checkpoint: no manual code, no location. */
type PublicCheckpointRecord = Pick<
	CheckpointRecord,
	"id" | "name" | "route_order" | "active"
>;

const toUser = (p: ProfileRow): User => ({
	id: p.id,
	name: p.name,
	role: p.role as Role,
	phone: p.phone,
});

/** A checkpoint's pin, or null when it has none. 50 m is the database's default radius. */
const toCheckpointLocation = (
	lat: number | null,
	lng: number | null,
	radiusM: number | null,
): CheckpointLocation | null =>
	lat === null || lng === null ? null : { lat, lng, radiusM: radiusM ?? 50 };

const toCheckpoint = (c: CheckpointRecord): Checkpoint => ({
	id: c.id,
	name: c.name,
	routeOrder: c.route_order,
	manualCode: c.manual_code,
	active: c.active,
	location: toCheckpointLocation(c.latitude, c.longitude, c.radius_m),
});

const toPublicCheckpoint = (c: PublicCheckpointRecord): PublicCheckpoint => ({
	id: c.id,
	name: c.name,
	routeOrder: c.route_order,
	active: c.active,
});

/** A scan, with the phone's position (if it sent one) and how that compared with the checkpoint. */
const toScan = (s: ScanRecord): Scan => ({
	id: s.id,
	checkpointId: s.checkpoint_id,
	guardId: s.guard_id,
	scannedAt: iso(s.scanned_at),
	receivedAt: iso(s.received_at),
	location:
		s.latitude === null || s.longitude === null
			? null
			: {
					lat: s.latitude,
					lng: s.longitude,
					accuracyM: s.accuracy_m ?? 0,
				},
	distanceM: s.distance_m,
	locationStatus: s.location_status as LocationStatus,
});

const toReport = (r: ReportRecord): Report => ({
	id: r.id,
	scanId: r.scan_id,
	note: r.note,
	photos: r.photos,
	createdAt: iso(r.created_at),
});

/** Columns of the scan_rows view. Views come out of the type generator as all-nullable. */
type ScanRowRecord = ScanRecord & {
	guard_name: string;
	checkpoint_name: string;
	report: ReportRecord | null;
	checkpoint_latitude: number | null;
	checkpoint_longitude: number | null;
	checkpoint_radius_m: number | null;
};

/** A scan_rows row: the scan plus guard and checkpoint names, its report, and the checkpoint's pin. */
const toScanRow = (r: Tables<"scan_rows">): ScanRow => {
	const v = r as unknown as ScanRowRecord; // the view's columns are never null in practice
	return {
		...toScan(v),
		guardName: v.guard_name,
		checkpointName: v.checkpoint_name,
		report: v.report ? toReport(v.report) : null,
		checkpointLocation: toCheckpointLocation(
			v.checkpoint_latitude,
			v.checkpoint_longitude,
			v.checkpoint_radius_m,
		),
	};
};

/** Start and end of a YYYY-MM-DD day in this device's time zone, as ISO instants. */
function dayRange(date: string): { from: string; to: string } {
	const from = new Date(`${date}T00:00:00`);
	const to = new Date(from);
	to.setDate(to.getDate() + 1);
	return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * The server answered and said no (a database or API error code). Anything else thrown by a
 * request, such as a failed fetch, means the server wasn't reached.
 */
export class ServerError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "ServerError";
	}
}

/** The { data, error } pair every Supabase call returns. */
type Result<T> = {
	data: T | null;
	error: { message: string; code?: string } | null;
};

/** An error with a code came from the server (ServerError); one without means it wasn't reached. */
function toError(e: { message: string; code?: string }): Error {
	return e.code ? new ServerError(e.message, e.code) : new Error(e.message);
}

/** Supabase returns errors instead of throwing. The rest of the app expects a throw. */
function must<T>(res: Result<T>): T {
	if (res.error) throw toError(res.error);
	if (res.data === null) throw new Error("empty_response");
	return res.data;
}

/** Like `must`, for queries where no row (or no return value) is a normal answer. */
function maybe<T>(res: Result<T>): T | null {
	if (res.error) throw toError(res.error);
	return res.data;
}

// ---------- QR signing ----------

/** What gets encoded into each checkpoint's QR sticker: PTRL1:<id>:<signature>. Signed in the database. */
export async function qrPayloadFor(checkpointId: string): Promise<string> {
	return must(
		await supabase.rpc("qr_payload", { p_checkpoint_id: checkpointId }),
	);
}

// ---------- auth ----------

/**
 * Returns null for a wrong phone number or password, or an account without an active profile.
 * `phone` is already normalised (digits with country code, see lib/phone.ts).
 */
export async function signIn(
	phone: string,
	password: string,
): Promise<User | null> {
	const { data, error } = await supabase.auth.signInWithPassword({
		phone: `+${phone}`,
		password,
	});
	if (error) {
		if (error.status === 400) return null; // invalid_credentials and friends
		throw error; // network or server trouble: the login screen says so
	}
	// The password was right; now check the account has a profile and is still active.
	const { data: profile, error: profileError } = await supabase
		.from("profiles")
		.select("id, name, role, phone, active")
		.eq("id", data.user.id)
		.maybeSingle();
	if (profileError) throw new Error(profileError.message);
	if (!profile || !profile.active) {
		await supabase.auth.signOut({ scope: "local" }); // don't leave a half-signed-in session behind
		return null;
	}
	return toUser(profile);
}

/** Ends the session on this device only. */
export async function signOut(): Promise<void> {
	await supabase.auth.signOut({ scope: "local" });
}

/** The signed-in user's id, from the stored session (works offline). */
export async function sessionUserId(): Promise<string | null> {
	const { data } = await supabase.auth.getSession();
	return data.session?.user.id ?? null;
}

/**
 * Calls `onEnd` when there is no session: now (e.g. storage was cleared) or later
 * (signed out elsewhere, refresh token revoked).
 */
export function onSessionEnd(onEnd: () => void): () => void {
	// Check once now, then listen for later sign-outs. Returns a function that stops listening.
	void supabase.auth.getSession().then(({ data }) => {
		if (!data.session) onEnd();
	});
	const { data } = supabase.auth.onAuthStateChange((event) => {
		if (event === "SIGNED_OUT") onEnd();
	});
	return () => data.subscription.unsubscribe();
}

// ---------- guard-facing ----------

/** Active checkpoints in route order, without manual codes. */
export async function publicCheckpoints(): Promise<PublicCheckpoint[]> {
	return must(await supabase.rpc("route_checkpoints")).map(
		toPublicCheckpoint,
	);
}

/** A saved scan and its checkpoint, or why the server didn't accept the code. */
export type SubmitResult =
	| { ok: true; scan: Scan; checkpoint: PublicCheckpoint }
	| { ok: false; reason: "unknown_code" | "inactive" };

/** The same answer as submit_scan returns it, before mapping to camelCase. */
type SubmitScanJson =
	| { ok: true; scan: ScanRecord; checkpoint: PublicCheckpointRecord }
	| { ok: false; reason: "unknown_code" | "inactive" };

/**
 * Accepts either a signed QR payload or a printed manual code.
 *
 * Idempotent: sending the same scan id twice returns the first result.
 * The server records the signed-in user as the guard, so a scan queued by someone else
 * on this phone is refused here and stays in the outbox until they sign in again.
 *
 * The server checks the QR signature or manual code, and compares the phone's position with the
 * checkpoint's pin (a scan too far away is still saved, marked "far").
 *
 * @param pending A scan made on the phone: its id, the code read or typed, the phone's time and,
 *   if it had one, the phone's position.
 * @returns The saved scan and its checkpoint, or `ok: false` with "unknown_code" (not a real
 *   checkpoint, or an old sticker) or "inactive" (a checkpoint taken out of use).
 * @throws ServerError("session_mismatch") if the signed-in guard isn't the one who scanned.
 */
export async function submitScan(pending: PendingScan): Promise<SubmitResult> {
	// The server records whoever is signed in as the guard, so without this check another
	// guard's queued scan would be saved under the wrong name.
	if ((await sessionUserId()) !== pending.guardId) {
		throw new ServerError("not_allowed", "session_mismatch");
	}

	const r = must(
		await supabase.rpc("submit_scan", {
			p_id: pending.id,
			p_code: pending.code,
			p_scanned_at: pending.scannedAt,
			// Position is optional: GPS often has nothing indoors.
			...(pending.location && {
				p_lat: pending.location.lat,
				p_lng: pending.location.lng,
				p_accuracy_m: pending.location.accuracyM,
			}),
		}),
	) as unknown as SubmitScanJson; // the function returns jsonb, which the generated types can't describe

	if (!r.ok) return { ok: false, reason: r.reason };

	return {
		ok: true,
		scan: toScan(r.scan),
		checkpoint: toPublicCheckpoint(r.checkpoint),
	};
}

/** Storage says 409 / "already exists" when a retried upload finds its file already there. */
const isDuplicateUpload = (e: { message: string }) =>
	(e as { statusCode?: string }).statusCode === "409" ||
	/already exists|duplicate/i.test(e.message);

/**
 * Uploads the photos (still data URLs from the phone), then stores the report with their paths.
 * Idempotent on report id, and safe to retry after a partial upload.
 * Rejects with "scan_not_synced" if the scan hasn't reached the server yet.
 */
export async function submitReport(report: Report): Promise<void> {
	const uid = await sessionUserId();
	if (!uid) throw new Error("not_signed_in");

	const paths: string[] = [];
	for (const [i, photo] of report.photos.entries()) {
		if (!photo.startsWith("data:")) {
			paths.push(photo); // already a Storage path
			continue;
		}
		// The same report always gives the same path, so a retry lands on the file already there.
		// The first folder is the uploader's id: Storage rules only let each user write their own.
		const path = `${uid}/${report.id}/${i + 1}.jpg`;
		const blob = await (await fetch(photo)).blob(); // data URL back to a file
		const { error } = await supabase.storage
			.from(PHOTO_BUCKET)
			.upload(path, blob, { contentType: "image/jpeg", upsert: false });
		if (error && !isDuplicateUpload(error)) throw new Error(error.message);
		paths.push(path);
	}

	maybe(
		await supabase.rpc("submit_report", {
			p_id: report.id,
			p_scan_id: report.scanId,
			p_note: report.note,
			p_photos: paths,
			p_created_at: report.createdAt,
		}),
	);
}

/** RLS: a guard can only read their own scans. */
export async function scansForGuardOnDate(
	guardId: string,
	date: string,
): Promise<Scan[]> {
	const { from, to } = dayRange(date);
	return must(
		await supabase
			.from("scans")
			.select("*")
			.eq("guard_id", guardId)
			.gte("scanned_at", from)
			.lt("scanned_at", to)
			.order("scanned_at"),
	).map(toScan);
}

// ---------- supervisor-facing (RLS: role = supervisor) ----------

/** Every guard, including deactivated ones, so old scans can still be filtered by guard. */
export async function listGuards(): Promise<User[]> {
	return must(
		await supabase
			.from("profiles")
			.select("id, name, role, phone")
			.eq("role", "guard")
			.order("name"),
	).map(toUser);
}

/** Every account, active ones first. */
export async function listAccounts(): Promise<Account[]> {
	return must(
		await supabase
			.from("profiles")
			.select("id, name, role, phone, active, phone_verified_at")
			.order("active", { ascending: false })
			.order("name"),
	).map((p) => ({
		...toUser(p),
		active: p.active,
		phoneVerified: p.phone_verified_at !== null,
	}));
}

/** Deactivated accounts can't sign in; reactivating restores everything. Not for your own account. */
export async function setAccountActive(
	id: string,
	active: boolean,
): Promise<void> {
	maybe(
		await supabase.rpc("set_account_active", {
			p_id: id,
			p_active: active,
		}),
	);
}

/** A new generated password for someone else, returned once. Runs in the reset-password Edge Function. */
export async function resetPassword(userId: string): Promise<string> {
	const { data, error } = await supabase.functions.invoke<{
		password: string;
	}>("reset-password", { body: { userId } });
	if (error || !data) throw new Error(error?.message ?? "reset_failed");
	return data.password;
}

/**
 * Creates one account per phone number, each with a generated password returned once.
 * Numbers that already have an account are skipped and returned in `existing`.
 * Runs in the create-guards Edge Function, which holds the service-role key.
 */
export async function createGuards(
	guards: NewGuard[],
): Promise<GuardImportResult> {
	const { data, error } = await supabase.functions.invoke<GuardImportResult>(
		"create-guards",
		{ body: { guards } },
	);
	if (error || !data)
		throw new Error(error?.message ?? "create_guards_failed");
	return data;
}

/**
 * Calls the staff-phone Edge Function. Its refusals come back as ServerError with the function's
 * own code (e.g. "phone_exists", "invalid_phone"), so screens can say what went wrong.
 */
async function staffPhone<T>(body: Record<string, string>): Promise<T> {
	const { data, error } = await supabase.functions.invoke<T>("staff-phone", {
		body,
	});
	if (error instanceof FunctionsHttpError) {
		const reply = (await error.context.json().catch(() => ({}))) as {
			error?: string;
		};
		const code = reply.error ?? "staff_phone_failed";
		throw new ServerError(code, code);
	}
	if (error || !data) throw new Error(error?.message ?? "staff_phone_failed");
	return data;
}

/** Gives someone a new sign-in number (or a first one). The new number starts as not confirmed. */
export async function changePhone(
	userId: string,
	phone: string,
): Promise<string> {
	return (
		await staffPhone<{ phone: string }>({ action: "change", userId, phone })
	).phone;
}

// TODO: sendPhoneCode / verifyPhoneCode (one-time codes to confirm a number) once a real SMS
// provider is set up. The earlier version is in commit 947b3c6. See README > TODO > Launch.

/** Every checkpoint that hasn't been removed, in round order. */
export async function allCheckpoints(): Promise<Checkpoint[]> {
	return must(
		await supabase
			.from("checkpoints")
			.select("*")
			.is("removed_at", null)
			.order("route_order"),
	).map(toCheckpoint);
}

/**
 * Removes checkpoints: they leave the round, the lists and the map, but old scans keep pointing
 * at them (and keep their names). Returns how many were removed.
 */
export async function removeCheckpoints(ids: string[]): Promise<number> {
	return must(await supabase.rpc("remove_checkpoints", { p_ids: ids }));
}

/**
 * Appends a checkpoint to the end of the route, with its map location, in one step (so a failed
 * request never leaves a checkpoint without a location). The server picks the id and a unique
 * manual code.
 */
export async function createCheckpoint(
	name: string,
	location: CheckpointLocation,
): Promise<Checkpoint> {
	return toCheckpoint(
		must(
			await supabase.rpc("create_checkpoint", {
				p_name: name,
				p_lat: location.lat,
				p_lng: location.lng,
				p_radius_m: location.radiusM,
			}),
		),
	);
}

/** Saves a checkpoint's name and whether it's in use. */
export async function updateCheckpoint(
	cp: Pick<Checkpoint, "id" | "name" | "active">,
): Promise<Checkpoint> {
	return toCheckpoint(
		must(
			await supabase.rpc("update_checkpoint", {
				p_id: cp.id,
				p_name: cp.name,
				p_active: cp.active,
			}),
		),
	);
}

/** Pins a checkpoint on the map, or clears its location (null). */
export async function setCheckpointLocation(
	id: string,
	location: CheckpointLocation | null,
): Promise<Checkpoint> {
	return toCheckpoint(
		must(
			await supabase.rpc("set_checkpoint_location", {
				p_id: id,
				// The function takes nulls to clear; the generated types don't say so.
				p_lat: (location?.lat ?? null) as number,
				p_lng: (location?.lng ?? null) as number,
				p_radius_m: (location?.radiusM ?? null) as number,
			}),
		),
	);
}

/** Swaps a checkpoint with the one before (up) or after it in the round. */
export async function moveCheckpoint(id: string, up: boolean): Promise<void> {
	maybe(await supabase.rpc("move_checkpoint", { p_id: id, p_up: up }));
}

/** New QR signature and typed code. Every copy of the old sticker stops working at once. */
export async function reissueCheckpoint(id: string): Promise<Checkpoint> {
	return toCheckpoint(
		must(await supabase.rpc("reissue_checkpoint", { p_id: id })),
	);
}

/** The scan log query with the supervisor's filters applied, newest first. Shared by the page and the export. */
function scanRowsQuery(
	q: Omit<ScanQuery, "page" | "pageSize">,
	count: boolean,
) {
	let query = supabase
		.from("scan_rows")
		.select("*", count ? { count: "exact" } : undefined);
	if (q.guardId) query = query.eq("guard_id", q.guardId);
	if (q.checkpointId) query = query.eq("checkpoint_id", q.checkpointId);
	if (q.date) {
		const { from, to } = dayRange(q.date);
		query = query.gte("scanned_at", from).lt("scanned_at", to);
	}
	// id as a tie-breaker keeps pages stable when two scans share a timestamp.
	return query.order("scanned_at", { ascending: false }).order("id");
}

/** Newest first. `count: 'exact'` gives the total for the pager. */
export async function listScans(q: ScanQuery): Promise<Page<ScanRow>> {
	const from = (q.page - 1) * q.pageSize; // pages start at 1; rows at 0
	const { data, error, count } = await scanRowsQuery(q, true).range(
		from,
		from + q.pageSize - 1,
	);
	if (error) throw new Error(error.message);
	return {
		rows: data.map(toScanRow),
		total: count ?? 0,
		page: q.page,
		pageSize: q.pageSize,
	};
}

/** Every matching row, fetched in batches because the API caps rows per request. */
export async function exportScans(
	q: Omit<ScanQuery, "page" | "pageSize">,
): Promise<ScanRow[]> {
	const rows: ScanRow[] = [];
	for (let from = 0; ; from += EXPORT_BATCH) {
		const batch = must(
			await scanRowsQuery(q, false).range(from, from + EXPORT_BATCH - 1),
		);
		rows.push(...batch.map(toScanRow));
		if (batch.length < EXPORT_BATCH) return rows; // a short batch is the last one
	}
}

/** One scan with its report. Photo paths are swapped for signed URLs the page can show. */
export async function getScan(id: string): Promise<ScanRow | null> {
	const record = maybe(
		await supabase.from("scan_rows").select("*").eq("id", id).maybeSingle(),
	);
	if (!record) return null;
	const row = toScanRow(record);
	if (row.report?.photos.length) {
		const signed = must(
			await supabase.storage
				.from(PHOTO_BUCKET)
				.createSignedUrls(row.report.photos, SIGNED_URL_SECONDS),
		);
		// A photo that couldn't be signed (e.g. its file is missing) is left out rather than shown broken.
		row.report.photos = signed.flatMap((s) =>
			s.signedUrl ? [s.signedUrl] : [],
		);
	}
	return row;
}

/** Every active guard with their scan count and last scan time on `date`, including guards with none. */
export async function guardSummaries(date: string): Promise<GuardSummary[]> {
	const { from, to } = dayRange(date);
	return must(
		await supabase.rpc("guard_summaries", { p_from: from, p_to: to }),
	).map((g) => ({
		guardId: g.guard_id,
		guardName: g.guard_name,
		scansToday: g.scans_today,
		lastScanAt: g.last_scan_at ? iso(g.last_scan_at) : null,
	}));
}

/** Active checkpoints nobody scanned on `date`, in route order. */
export async function missedCheckpoints(date: string): Promise<Checkpoint[]> {
	const { from, to } = dayRange(date);
	return must(
		await supabase.rpc("missed_checkpoints", { p_from: from, p_to: to }),
	).map(toCheckpoint);
}
