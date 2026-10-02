/**
 * The Today dashboard's sections, worked out from today's scans: which checkpoints in use have
 * been scanned (and the latest scan of each), which haven't been scanned at all, which scans need
 * a supervisor's look, and how each guard's patrol is going.
 * "Today" is the supervisor's device's calendar day (see localDateKey); the caller fetches that
 * day's scans. Kept free of Preact and Supabase so it can be tested on its own.
 */
import type { Checkpoint, GuardSummary, ScanRow } from "../types";

export interface CompletedCheckpoint {
	checkpoint: Checkpoint;
	/** The most recent scan of it today. */
	lastScan: ScanRow;
	/** How many times it was scanned today, by anyone. */
	scans: number;
}

export interface TodayCheckpoints {
	completed: CompletedCheckpoint[];
	notVisited: Checkpoint[];
	/** Checkpoints in use: completed + notVisited. */
	total: number;
}

/**
 * Splits the checkpoints in use into completed and not yet visited, both in round order.
 * Checkpoints taken out of use are left out entirely, and so are scans of them.
 * A scan counts wherever it was made from: a "far" scan still completes the checkpoint (it shows
 * as a location badge, and will be flagged under Needs review).
 */
export function todayCheckpoints(
	checkpoints: Checkpoint[],
	scans: ScanRow[],
): TodayCheckpoints {
	const inUse = checkpoints
		.filter((c) => c.active)
		// oxlint-disable-next-line unicorn/no-array-sort -- sorts filter()'s copy; toSorted() needs newer browsers than the app targets
		.sort((a, b) => a.routeOrder - b.routeOrder);

	const byCheckpoint = new Map<string, { last: ScanRow; count: number }>();
	for (const s of scans) {
		const seen = byCheckpoint.get(s.checkpointId);
		if (!seen) byCheckpoint.set(s.checkpointId, { last: s, count: 1 });
		else {
			seen.count++;
			if (s.scannedAt > seen.last.scannedAt) seen.last = s;
		}
	}

	const completed: CompletedCheckpoint[] = [];
	const notVisited: Checkpoint[] = [];
	for (const c of inUse) {
		const seen = byCheckpoint.get(c.id);
		if (seen)
			completed.push({
				checkpoint: c,
				lastScan: seen.last,
				scans: seen.count,
			});
		else notVisited.push(c);
	}
	return { completed, notVisited, total: inUse.length };
}

/** The Needs review and Guards on duty rules' thresholds, in one place. */
export const REVIEW = {
	/** A scan that reached the server this long after it was made was sent late. */
	lateAfterMs: 60 * 60_000,
	/** The same guard scanning two different checkpoints closer together than this is too fast. */
	tooFastMs: 60_000,
	/** A guard who scanned within this long ago is patrolling; earlier today, quiet. */
	patrollingMs: 60 * 60_000,
} as const;

export type ReviewReason =
	| "reasonFar"
	| "reasonNoGps"
	| "reasonReport"
	| "reasonLate"
	| "reasonTooFast";

/** Why a scan needs a look. The number says how much: metres, or milliseconds for late and too fast. */
export interface ReviewFlag {
	reason: ReviewReason;
	amount?: number;
}

export interface ReviewItem {
	scan: ScanRow;
	flags: ReviewFlag[];
}

/**
 * Today's scans that need a supervisor's look, newest first, each with every reason that applies:
 *   - far from the checkpoint, or no GPS (the server's location_status)
 *   - has a report: a note or photos, likely an incident
 *   - sent late: received more than REVIEW.lateAfterMs after it was made (long offline, or a
 *     wrong phone clock)
 *   - too fast: the guard's previous scan was of a different checkpoint less than
 *     REVIEW.tooFastMs earlier (the later scan of the pair is flagged)
 * Not flagged on purpose: no report (reports are optional) and checkpoint not pinned (a setup
 * issue, not the guard's).
 */
export function needsReview(scans: ScanRow[]): ReviewItem[] {
	const ms = (iso: string) => Date.parse(iso);

	// Each guard's scans in time order, to find the scan before each one.
	const previous = new Map<string, ScanRow>();
	const byGuard = new Map<string, ScanRow[]>();
	for (const s of scans) {
		const list = byGuard.get(s.guardId);
		if (list) list.push(s);
		else byGuard.set(s.guardId, [s]);
	}
	for (const list of byGuard.values()) {
		// oxlint-disable-next-line unicorn/no-array-sort -- sorts this function's own list
		list.sort((a, b) => ms(a.scannedAt) - ms(b.scannedAt));
		for (let i = 1; i < list.length; i++)
			previous.set(list[i].id, list[i - 1]);
	}

	const items: ReviewItem[] = [];
	for (const s of scans) {
		const flags: ReviewFlag[] = [];
		if (s.locationStatus === "far")
			flags.push({
				reason: "reasonFar",
				amount: s.distanceM ?? undefined,
			});
		if (s.locationStatus === "no_fix")
			flags.push({ reason: "reasonNoGps" });
		if (s.report && (s.report.note.trim() || s.report.photos.length))
			flags.push({ reason: "reasonReport" });
		const delay = ms(s.receivedAt) - ms(s.scannedAt);
		if (delay > REVIEW.lateAfterMs)
			flags.push({ reason: "reasonLate", amount: delay });
		const prev = previous.get(s.id);
		if (prev && prev.checkpointId !== s.checkpointId) {
			const gap = ms(s.scannedAt) - ms(prev.scannedAt);
			if (gap < REVIEW.tooFastMs)
				flags.push({ reason: "reasonTooFast", amount: gap });
		}
		if (flags.length) items.push({ scan: s, flags });
	}
	// oxlint-disable-next-line unicorn/no-array-sort -- sorts this function's own list
	return items.sort((a, b) => ms(b.scan.scannedAt) - ms(a.scan.scannedAt));
}

export type GuardStatus = "guardPatrolling" | "guardQuiet" | "guardNotStarted";

export interface GuardOnDuty extends GuardSummary {
	status: GuardStatus;
}

const STATUS_ORDER: GuardStatus[] = [
	"guardPatrolling",
	"guardQuiet",
	"guardNotStarted",
];

/**
 * Every active guard with a status from their last scan today: patrolling (within
 * REVIEW.patrollingMs of `now`), quiet (earlier today) or not started (no scans). Patrolling
 * first, then quiet, then not started; by name within each.
 * There are no shifts yet, so "on duty" can't mean "scheduled" (see README > TODO).
 */
export function guardsOnDuty(
	guards: GuardSummary[],
	now: number = Date.now(),
): GuardOnDuty[] {
	return (
		guards
			.map((g): GuardOnDuty => {
				let status: GuardStatus = "guardNotStarted";
				if (g.lastScanAt)
					status =
						now - Date.parse(g.lastScanAt) <= REVIEW.patrollingMs
							? "guardPatrolling"
							: "guardQuiet";
				return { ...g, status };
			})
			// oxlint-disable-next-line unicorn/no-array-sort -- sorts map()'s copy
			.sort(
				(a, b) =>
					STATUS_ORDER.indexOf(a.status) -
						STATUS_ORDER.indexOf(b.status) ||
					a.guardName.localeCompare(b.guardName),
			)
	);
}
