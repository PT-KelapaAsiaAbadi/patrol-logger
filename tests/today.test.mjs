// Today dashboard sections and checkpoint name rules. Pure functions, no database: run with
// --experimental-strip-types so the TypeScript modules load directly.
const { todayCheckpoints } = await import("../src/lib/today.ts");
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
