/**
 * BACKEND (Supabase)
 * ------------------
 *   - signIn / signOut   -> Supabase Auth (email + password)
 *   - reads              -> tables and the scan_rows view, filtered by Row Level Security
 *   - writes             -> SECURITY DEFINER functions that check the caller (supabase/migrations)
 *   - createGuards       -> the create-guards Edge Function (needs the service-role key)
 *   - report photos      -> the private report-photos Storage bucket
 *
 * The UI never imports this file directly. It goes through `api.ts`.
 * Database rows are snake_case; everything returned from here is the camelCase shape in types.ts.
 */
import type {
	Account,
	Checkpoint,
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
import { supabase } from "../supabaseClient";

const PHOTO_BUCKET = "report-photos";
const SIGNED_URL_SECONDS = 60 * 60;
const EXPORT_BATCH = 1000; // PostgREST's default maximum rows per request

// ---------- mapping ----------

/** Postgres returns "+00:00" and microseconds; the app compares ISO strings, so normalise them. */
const iso = (t: string) => new Date(t).toISOString();

type ProfileRow = Pick<Tables<"profiles">, "id" | "name" | "role" | "email">;
type ScanRecord = Tables<"scans">;
type ReportRecord = Omit<Tables<"reports">, "created_at"> & {
	created_at: string;
};
type CheckpointRecord = Tables<"checkpoints">;
type PublicCheckpointRecord = Pick<
	CheckpointRecord,
	"id" | "name" | "route_order" | "active"
>;

const toUser = (p: ProfileRow): User => ({
	id: p.id,
	name: p.name,
	role: p.role as Role,
	email: p.email,
});

const toCheckpoint = (c: CheckpointRecord): Checkpoint => ({
	id: c.id,
	name: c.name,
	routeOrder: c.route_order,
	manualCode: c.manual_code,
	active: c.active,
});

const toPublicCheckpoint = (c: PublicCheckpointRecord): PublicCheckpoint => ({
	id: c.id,
	name: c.name,
	routeOrder: c.route_order,
	active: c.active,
});

const toScan = (s: ScanRecord): Scan => ({
	id: s.id,
	checkpointId: s.checkpoint_id,
	guardId: s.guard_id,
	scannedAt: iso(s.scanned_at),
	receivedAt: iso(s.received_at),
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
};

const toScanRow = (r: Tables<"scan_rows">): ScanRow => {
	const v = r as unknown as ScanRowRecord;
	return {
		...toScan(v),
		guardName: v.guard_name,
		checkpointName: v.checkpoint_name,
		report: v.report ? toReport(v.report) : null,
	};
};

/** Start and end of a YYYY-MM-DD day in this device's time zone, as ISO instants. */
function dayRange(date: string): { from: string; to: string } {
	const from = new Date(`${date}T00:00:00`);
	const to = new Date(from);
	to.setDate(to.getDate() + 1);
	return { from: from.toISOString(), to: to.toISOString() };
}

type Result<T> = { data: T | null; error: { message: string } | null };

/** Supabase returns errors instead of throwing. The rest of the app expects a throw. */
function must<T>(res: Result<T>): T {
	if (res.error) throw new Error(res.error.message);
	if (res.data === null) throw new Error("empty_response");
	return res.data;
}

/** Like `must`, for queries where no row (or no return value) is a normal answer. */
function maybe<T>(res: Result<T>): T | null {
	if (res.error) throw new Error(res.error.message);
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

/** Returns null for a wrong email or password, or an account without an active profile. */
export async function signIn(
	email: string,
	password: string,
): Promise<User | null> {
	const { data, error } = await supabase.auth.signInWithPassword({
		email: email.trim().toLowerCase(),
		password,
	});
	if (error) {
		if (error.status === 400) return null; // invalid_credentials and friends
		throw error; // network or server trouble: the login screen says so
	}
	const { data: profile, error: profileError } = await supabase
		.from("profiles")
		.select("id, name, role, email, active")
		.eq("id", data.user.id)
		.maybeSingle();
	if (profileError) throw new Error(profileError.message);
	if (!profile || !profile.active) {
		await supabase.auth.signOut({ scope: "local" });
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

export type SubmitResult =
	| { ok: true; scan: Scan; checkpoint: PublicCheckpoint }
	| { ok: false; reason: "unknown_code" | "inactive" };

type SubmitScanJson =
	| { ok: true; scan: ScanRecord; checkpoint: PublicCheckpointRecord }
	| { ok: false; reason: "unknown_code" | "inactive" };

/**
 * Accepts either a signed QR payload or a printed manual code.
 * Idempotent: sending the same scan id twice returns the first result.
 * The server records the signed-in user as the guard, so a scan queued by someone else
 * on this phone is refused here and stays in the outbox until they sign in again.
 */
export async function submitScan(pending: PendingScan): Promise<SubmitResult> {
	if ((await sessionUserId()) !== pending.guardId)
		throw new Error("not_allowed");
	const r = must(
		await supabase.rpc("submit_scan", {
			p_id: pending.id,
			p_code: pending.code,
			p_scanned_at: pending.scannedAt,
		}),
	) as unknown as SubmitScanJson;
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
		const path = `${uid}/${report.id}/${i + 1}.jpg`;
		const blob = await (await fetch(photo)).blob();
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
			.select("id, name, role, email")
			.eq("role", "guard")
			.order("name"),
	).map(toUser);
}

/** Every account, active ones first. */
export async function listAccounts(): Promise<Account[]> {
	return must(
		await supabase
			.from("profiles")
			.select("id, name, role, email, active")
			.order("active", { ascending: false })
			.order("name"),
	).map((p) => ({ ...toUser(p), active: p.active }));
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
 * Creates one guard account per email, each with a generated password returned once.
 * Emails that already have an account are skipped and returned in `existing`.
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

export async function allCheckpoints(): Promise<Checkpoint[]> {
	return must(
		await supabase.from("checkpoints").select("*").order("route_order"),
	).map(toCheckpoint);
}

/** Appends a checkpoint to the end of the route. The server picks the id and a unique manual code. */
export async function createCheckpoint(name: string): Promise<Checkpoint> {
	return toCheckpoint(
		must(await supabase.rpc("create_checkpoint", { p_name: name })),
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
	const from = (q.page - 1) * q.pageSize;
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
		if (batch.length < EXPORT_BATCH) return rows;
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
		row.report.photos = signed.flatMap((s) =>
			s.signedUrl ? [s.signedUrl] : [],
		);
	}
	return row;
}

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
