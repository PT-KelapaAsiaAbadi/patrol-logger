// Today dashboard sections and checkpoint name rules. Pure functions, no database: run with
// --experimental-strip-types so the TypeScript modules load directly.
const { todayCheckpoints, needsReview, guardsOnDuty } =
	await import("../src/lib/today.ts");
const { checkpointNameProblem, tidyCheckpointName } =
	await import("../src/lib/checkpointName.ts");
const { reporter } = await import("./local-supabase.mjs");
const { ok, section, done } = reporter();

const cp = (id, routeOrder, active = true) => ({
	id,
	name: `Titik ${id}`,
	routeOrder,
	manualCode: "ABC-DEF",
	active,
	location: null,
});
const scan = (id, checkpointId, scannedAt) => ({
	id,
	checkpointId,
	guardId: "g1",
	guardName: "Budi Santoso",
	checkpointName: `Titik ${checkpointId}`,
	scannedAt,
	receivedAt: scannedAt,
	location: null,
	distanceM: null,
	locationStatus: "no_fix",
	report: null,
	checkpointLocation: null,
});

section("today's checkpoints");
{
	const checkpoints = [cp("b", 2), cp("a", 1), cp("c", 3), cp("x", 4, false)];
	const scans = [
		scan("s1", "b", "2026-09-28T01:00:00.000Z"),
		scan("s2", "b", "2026-09-28T03:00:00.000Z"),
		scan("s3", "b", "2026-09-28T02:00:00.000Z"),
		scan("s4", "x", "2026-09-28T02:30:00.000Z"),
	];
	const r = todayCheckpoints(checkpoints, scans);
	ok(r.total === 3, "only checkpoints in use count", r.total);
	ok(
		r.completed.length === 1 && r.completed[0].checkpoint.id === "b",
		"a scanned checkpoint is completed",
	);
	ok(
		r.completed[0].lastScan.id === "s2" && r.completed[0].scans === 3,
		"completed keeps the latest scan and counts all of them",
		`${r.completed[0].lastScan.id}, ${r.completed[0].scans}`,
	);
	ok(
		r.notVisited.map((c) => c.id).join(",") === "a,c",
		"not visited, in round order",
		r.notVisited.map((c) => c.id).join(","),
	);
	ok(
		!r.completed.some((c) => c.checkpoint.id === "x"),
		"a checkpoint out of use is left out even if it was scanned",
	);
	const empty = todayCheckpoints(checkpoints, []);
	ok(
		empty.completed.length === 0 && empty.notVisited.length === 3,
		"no scans: everything in use is not yet visited",
	);
}

section("needs review");
{
	const at = (hhmm) => `2026-09-28T${hhmm}:00.000Z`;
	const row = (id, checkpointId, scannedAt, more = {}) => ({
		...scan(id, checkpointId, scannedAt),
		locationStatus: "ok",
		...more,
	});
	const scans = [
		row("ok", "a", at("01:00")),
		row("far", "b", at("02:00"), {
			locationStatus: "far",
			distanceM: 5600,
		}),
		row("nogps", "c", at("03:00"), { locationStatus: "no_fix" }),
		row("note", "a", at("04:00"), {
			report: {
				id: "r",
				scanId: "note",
				note: "Pintu rusak",
				photos: [],
				createdAt: at("04:01"),
			},
		}),
		row("empty-report", "b", at("05:00"), {
			report: {
				id: "r2",
				scanId: "empty-report",
				note: " ",
				photos: [],
				createdAt: at("05:01"),
			},
		}),
		row("late", "c", at("06:00"), { receivedAt: at("08:10") }),
		row("just-in-time", "a", at("09:00"), { receivedAt: at("10:00") }),
		// 40 s after "just-in-time", another checkpoint: too fast.
		row("fast", "b", "2026-09-28T09:00:40.000Z"),
		// The same checkpoint twice in a row is a re-scan, not too fast.
		row("rescan", "b", "2026-09-28T09:00:50.000Z"),
		// Another guard close behind doesn't count against this one.
		row("other-guard", "c", "2026-09-28T09:00:45.000Z", { guardId: "g2" }),
	];
	const r = needsReview(scans);
	const ids = r.map((i) => i.scan.id);
	const flags = (id) =>
		r
			.find((i) => i.scan.id === id)
			?.flags.map((f) => f.reason)
			.join(",");
	ok(
		ids.join(",") === "fast,late,note,nogps,far",
		"only flagged scans, newest first",
		ids.join(","),
	);
	ok(
		flags("far") === "reasonFar" &&
			r.find((i) => i.scan.id === "far").flags[0].amount === 5600,
		"far from the checkpoint, with the distance",
	);
	ok(flags("nogps") === "reasonNoGps", "no GPS");
	ok(flags("note") === "reasonReport", "a report with a note");
	ok(!ids.includes("empty-report"), "an empty report isn't flagged");
	ok(
		flags("late") === "reasonLate" &&
			r.find((i) => i.scan.id === "late").flags[0].amount ===
				130 * 60_000,
		"sent more than an hour late, with the delay",
	);
	ok(!ids.includes("just-in-time"), "sent exactly an hour later isn't late");
	ok(
		flags("fast") === "reasonTooFast" &&
			r.find((i) => i.scan.id === "fast").flags[0].amount === 40_000,
		"two checkpoints 40 s apart by one guard: the later one is too fast",
	);
	ok(
		!ids.includes("rescan") && !ids.includes("other-guard"),
		"a re-scan of the same checkpoint, or another guard's scan, isn't too fast",
	);
	const both = needsReview([
		row("x", "a", at("01:00"), {
			locationStatus: "no_fix",
			receivedAt: at("03:00"),
		}),
	]);
	ok(
		both[0].flags.map((f) => f.reason).join(",") ===
			"reasonNoGps,reasonLate",
		"a scan with several reasons is listed once, with all of them",
	);
	ok(needsReview([]).length === 0, "no scans: nothing to review");
}

section("guards on duty");
{
	const now = Date.parse("2026-09-28T10:00:00.000Z");
	const g = (guardName, lastScanAt, scansToday = lastScanAt ? 1 : 0) => ({
		guardId: guardName,
		guardName,
		scansToday,
		lastScanAt,
	});
	const r = guardsOnDuty(
		[
			g("Zaki", "2026-09-28T09:30:00.000Z"),
			g("Agus", null),
			g("Budi", "2026-09-28T08:59:00.000Z"),
			g("Siti", "2026-09-28T09:00:00.000Z"),
			g("Dewi", "2026-09-28T09:55:00.000Z"),
		],
		now,
	);
	ok(
		r.map((x) => `${x.guardName}:${x.status}`).join(" ") ===
			"Dewi:guardPatrolling Siti:guardPatrolling Zaki:guardPatrolling Budi:guardQuiet Agus:guardNotStarted",
		"patrolling within the hour, quiet before that, not started without scans; by name in each",
		r.map((x) => `${x.guardName}:${x.status}`).join(" "),
	);
	ok(guardsOnDuty([], now).length === 0, "no guards: an empty list");
}

section("checkpoint names");
{
	const existing = [{ id: "1", name: "Lobi utama" }];
	ok(
		checkpointNameProblem("Pos belakang", existing) === null,
		"a normal name is fine",
	);
	ok(
		checkpointNameProblem("  Po  ", existing) === "nameTooShort",
		"under 3 characters after trimming is too short",
	);
	ok(
		checkpointNameProblem("x".repeat(51), existing) === "nameTooLong",
		"over 50 characters is too long",
	);
	ok(
		checkpointNameProblem("x".repeat(50), existing) === null,
		"exactly 50 characters is allowed",
	);
	ok(
		checkpointNameProblem("--- ...", existing) === "nameNoLetters",
		"punctuation only is refused",
	);
	ok(
		checkpointNameProblem("lobi   UTAMA", existing) === "nameDuplicate",
		"a repeated name is caught ignoring case and extra spaces",
	);
	ok(
		checkpointNameProblem("Lobi utama", existing, "1") === null,
		"renaming a checkpoint to its own name is fine",
	);
	ok(
		tidyCheckpointName("  Tangga   darurat  ") === "Tangga darurat",
		"names are tidied the way the database stores them",
	);
}

done();
