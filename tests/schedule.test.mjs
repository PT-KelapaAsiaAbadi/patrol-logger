// Schedule page rules: shift times, slots and warnings. Pure functions, no database: run with
// --experimental-strip-types so the TypeScript modules load directly. Times are local, as in the
// app, so every check works in any time zone.
const {
	addDays,
	emptySlots,
	scheduleWarnings,
	shiftDay,
	shiftHours,
	shiftKind,
	shiftsBySlot,
	shiftTimes,
	slotKey,
} = await import("../src/lib/schedule.ts");
const { reporter } = await import("./local-supabase.mjs");
const { ok, section, done } = reporter();

const HOUR = 3_600_000;
let n = 0;
const shift = (guard, day, kind) => ({
	id: `s${++n}`,
	guardId: guard,
	guardName: guard === "b" ? "Budi Santoso" : "Siti Rahma",
	...shiftTimes(day, kind),
});

section("shift times");
{
	const night = shiftTimes("2026-10-05", "shiftNight");
	ok(
		new Date(night.startsAt).getHours() === 23 &&
			new Date(night.endsAt).getHours() === 7,
		"a night shift runs 23:00 to 07:00",
	);
	ok(
		shiftDay(night) === "2026-10-05" &&
			new Date(night.endsAt).getDate() === 6,
		"it belongs to the day it starts, and ends the next morning",
	);
	ok(
		(Date.parse(night.endsAt) - Date.parse(night.startsAt)) / HOUR === 8,
		"8 hours long",
	);
	ok(
		shiftKind(shiftTimes("2026-10-05", "shiftAfternoon")) ===
			"shiftAfternoon",
		"a saved shift is recognised as the kind it was made from",
	);
	const odd = shiftTimes("2026-10-05", "shiftMorning");
	odd.endsAt = new Date(Date.parse(odd.startsAt) + 9 * HOUR).toISOString();
	ok(
		shiftKind(odd) === null,
		"other times are not one of the offered shifts",
	);
	ok(
		shiftHours("shiftNight") === "23:00-07:00" &&
			shiftHours("shiftMorning") === "07:00-15:00",
		"labels show start and end",
	);
	ok(
		addDays("2026-10-01", 7) === "2026-10-08" &&
			addDays("2026-10-01", -1) === "2026-09-30",
		"moving between weeks and days crosses month ends",
	);
}

section("slots");
{
	const days = ["2026-10-05", "2026-10-06"];
	const list = [
		shift("s", days[0], "shiftMorning"),
		shift("b", days[0], "shiftMorning"),
		shift("b", days[1], "shiftNight"),
	];
	const slots = shiftsBySlot(list);
	ok(
		slots
			.get(slotKey(days[0], "shiftMorning"))
			?.map((s) => s.guardName)
			.join(", ") === "Budi Santoso, Siti Rahma",
		"a slot lists its guards by name",
	);
	const empty = emptySlots(list, days);
	ok(
		empty.length === 4 &&
			!empty.includes(slotKey(days[1], "shiftNight")) &&
			empty.includes(slotKey(days[0], "shiftAfternoon")),
		"empty slots: every offered shift nobody works",
		empty.join(" "),
	);
}

section("warnings");
{
	const week = [
		"2026-10-05",
		"2026-10-06",
		"2026-10-07",
		"2026-10-08",
		"2026-10-09",
		"2026-10-10",
		"2026-10-11",
	];
	const from = new Date(`${week[0]}T00:00:00`).toISOString();
	const to = new Date(`${addDays(week[6], 1)}T00:00:00`).toISOString();

	const five = week.slice(0, 5).map((d) => shift("b", d, "shiftMorning"));
	ok(
		scheduleWarnings(five, from, to).length === 0,
		"five 8-hour shifts (40 h) with a night between: no warnings",
	);
	const six = week.slice(0, 6).map((d) => shift("b", d, "shiftMorning"));
	const over = scheduleWarnings(six, from, to);
	ok(
		over.length === 1 &&
			over[0].kind === "overHours" &&
			over[0].hours === 48,
		"six shifts: 48 hours, over the 40-hour week",
	);

	const tight = [
		shift("s", week[0], "shiftNight"), // Mon 23:00 - Tue 07:00
		shift("s", week[1], "shiftMorning"), // Tue 07:00 - 15:00: no rest
		shift("s", week[1], "shiftNight"), // Tue 23:00: 8 hours after 15:00, fine
	];
	const rest = scheduleWarnings(tight, from, to);
	ok(
		rest.length === 1 &&
			rest[0].kind === "shortRest" &&
			rest[0].hours === 0 &&
			rest[0].shift.id === tight[1].id,
		"straight from a night shift into a morning shift: short rest, on the later shift",
	);

	const before = shift("b", addDays(week[0], -1), "shiftNight"); // Sun 23:00 - Mon 07:00
	const monday = shift("b", week[0], "shiftMorning");
	ok(
		scheduleWarnings([before, monday], from, to).some(
			(w) => w.kind === "shortRest",
		),
		"rest is checked against last week's final shift too",
	);
	ok(
		scheduleWarnings([before], from, to).length === 0,
		"a shift outside the week isn't counted in its hours",
	);
}

done();
