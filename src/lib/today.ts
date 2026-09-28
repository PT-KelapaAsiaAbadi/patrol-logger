/**
 * The Today dashboard's checkpoint sections, worked out from today's scans: which checkpoints in
 * use have been scanned (and the latest scan of each), and which haven't been scanned at all.
 * "Today" is the supervisor's device's calendar day (see localDateKey); the caller fetches that
 * day's scans. Kept free of Preact and Supabase so it can be tested on its own.
 */
import type { Checkpoint, ScanRow } from "../types";

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
