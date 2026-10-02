/**
 * Manual scheduling rules for the Schedule page: the shift times the app offers, a shift's
 * timestamps on a given day, which slot (day and shift) an existing shift fills, and the warnings
 * shown to the supervisor (too many hours in a week, too little rest between two shifts, shifts
 * nobody works). Nothing here assigns guards by itself: supervisors decide, the app checks.
 * Times are the device's local time (WIB/WITA/WIT). Kept free of Preact and Supabase so it can be
 * tested on its own (tests/schedule.test.mjs).
 */
// The .ts extension lets the unit tests load this file in Node directly (Vite accepts both).
import { localDateKey } from "./format.ts";
import type { Shift } from "../types";

export type ShiftKind = "shiftMorning" | "shiftAfternoon" | "shiftNight";

/**
 * The shift times the app offers, in order. To agree with the owner (README > Status and TODO >
 * Not decided yet); the database stores real start and end times, so changing these needs no
 * migration, only shifts already saved keep their old times.
 */
export const SHIFT_KINDS: { kind: ShiftKind; start: string; hours: number }[] =
	[
		{ kind: "shiftMorning", start: "07:00", hours: 8 },
		{ kind: "shiftAfternoon", start: "15:00", hours: 8 },
		{ kind: "shiftNight", start: "23:00", hours: 8 },
	];

/**
 * Warning thresholds. Indonesian rules (PP 35/2021) set a normal week of 40 hours; 8 hours' rest
 * between shifts is a common minimum. Confirm both with the owner or HR.
 */
export const SCHEDULE_RULES = {
	maxWeekHours: 40,
	minRestHours: 8,
} as const;

const HOUR = 3_600_000;

/** A day key moved by `n` days (negative: earlier). */
export function addDays(key: string, n: number): string {
	const d = new Date(`${key}T12:00:00`);
	d.setDate(d.getDate() + n);
	return localDateKey(d);
}

/** "07:00-15:00": a kind of shift's times, for labels. */
export function shiftHours(kind: ShiftKind): string {
	const def = SHIFT_KINDS.find((k) => k.kind === kind)!;
	const [h, m] = def.start.split(":").map(Number);
	const end = (h + def.hours) % 24;
	return `${def.start}-${String(end).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Start and end of a kind of shift on a day; a night shift ends the next morning. */
export function shiftTimes(
	day: string,
	kind: ShiftKind,
): { startsAt: string; endsAt: string } {
	const def = SHIFT_KINDS.find((k) => k.kind === kind)!;
	const start = new Date(`${day}T${def.start}:00`);
	return {
		startsAt: start.toISOString(),
		endsAt: new Date(start.getTime() + def.hours * HOUR).toISOString(),
	};
}

/** The day a shift belongs to: the day it starts, so a night shift counts on its first day. */
export const shiftDay = (s: Pick<Shift, "startsAt">) =>
	localDateKey(s.startsAt);

/** Which offered shift this is, from its start time and length; null for any other times. */
export function shiftKind(
	s: Pick<Shift, "startsAt" | "endsAt">,
): ShiftKind | null {
	const start = new Date(s.startsAt);
	const hhmm = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
	const hours = (Date.parse(s.endsAt) - start.getTime()) / HOUR;
	return (
		SHIFT_KINDS.find((k) => k.start === hhmm && k.hours === hours)?.kind ??
		null
	);
}

/** Slot key: a day and a kind of shift ("other" for shifts at other times). */
export const slotKey = (day: string, kind: ShiftKind | "other") =>
	`${day}|${kind}`;

/** The week's shifts by slot, each slot's guards in name order. */
export function shiftsBySlot(shifts: Shift[]): Map<string, Shift[]> {
	const slots = new Map<string, Shift[]>();
	for (const s of shifts) {
		const key = slotKey(shiftDay(s), shiftKind(s) ?? "other");
		const list = slots.get(key);
		if (list) list.push(s);
		else slots.set(key, [s]);
	}
	for (const list of slots.values())
		// oxlint-disable-next-line unicorn/no-array-sort -- sorts this function's own list
		list.sort((a, b) => a.guardName.localeCompare(b.guardName));
	return slots;
}

/** The week's slots nobody works: each day of `days` times each offered shift. */
export function emptySlots(shifts: Shift[], days: string[]): string[] {
	const filled = shiftsBySlot(shifts);
	return days.flatMap((d) =>
		SHIFT_KINDS.map((k) => slotKey(d, k.kind)).filter(
			(key) => !filled.has(key),
		),
	);
}

export type ScheduleWarning =
	| {
			kind: "overHours";
			guardId: string;
			guardName: string;
			/** Hours of shifts starting in the week. */
			hours: number;
	  }
	| {
			kind: "shortRest";
			guardId: string;
			guardName: string;
			/** Hours between the end of one shift and the start of the next. */
			hours: number;
			/** The later of the two shifts. */
			shift: Shift;
	  };

/**
 * Warnings for the week [weekStart, weekEnd) (ISO times). `shifts` may include shifts just
 * outside the week, so rest before the first one and after the last one is checked too; only
 * problems ending inside the week are reported.
 */
export function scheduleWarnings(
	shifts: Shift[],
	weekStart: string,
	weekEnd: string,
): ScheduleWarning[] {
	const inWeek = (s: Shift) =>
		s.startsAt >= weekStart && s.startsAt < weekEnd;
	const byGuard = new Map<string, Shift[]>();
	for (const s of shifts) {
		const list = byGuard.get(s.guardId);
		if (list) list.push(s);
		else byGuard.set(s.guardId, [s]);
	}

	const warnings: ScheduleWarning[] = [];
	for (const list of byGuard.values()) {
		// oxlint-disable-next-line unicorn/no-array-sort -- sorts this function's own list
		list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
		const { guardId, guardName } = list[0];

		const hours = list
			.filter(inWeek)
			.reduce(
				(sum, s) =>
					sum +
					(Date.parse(s.endsAt) - Date.parse(s.startsAt)) / HOUR,
				0,
			);
		if (hours > SCHEDULE_RULES.maxWeekHours)
			warnings.push({ kind: "overHours", guardId, guardName, hours });

		for (let i = 1; i < list.length; i++) {
			const rest =
				(Date.parse(list[i].startsAt) -
					Date.parse(list[i - 1].endsAt)) /
				HOUR;
			if (rest < SCHEDULE_RULES.minRestHours && inWeek(list[i]))
				warnings.push({
					kind: "shortRest",
					guardId,
					guardName,
					hours: Math.max(0, rest),
					shift: list[i],
				});
		}
	}
	return warnings;
}
