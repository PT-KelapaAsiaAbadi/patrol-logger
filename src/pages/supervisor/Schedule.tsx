/**
 * The Schedule tab: the week's guard roster, one row per guard and one column per day, each cell a
 * shift (morning, afternoon, night) or a day off.
 *
 * TODO: scheduling isn't built yet: this page shows sample data (and says so) to settle the layout.
 * To build it:
 *   - a `shifts` table: guard_id, starts_at, ends_at (a night shift crosses midnight), created_by;
 *     written only through supervisor-checked functions, readable by the guard it belongs to
 *   - add, edit, copy last week, and remove shifts from this page; move between weeks
 *   - Today's "Guards on duty" then lists who is scheduled now, and "Not yet visited" / missed
 *     checkpoints can be counted per shift instead of per calendar day
 *   - decide shift names and times with the owner (the sample uses 07-15, 15-23, 23-07)
 * See README > TODO > Decisions (Shifts).
 */
import { useApp } from "../../state";
import {
	formatLongDate,
	formatShortDay,
	localDateKey,
	weekKeys,
} from "../../lib/format";
import { ICON } from "../../components/IconButton";
import { CalendarPlus, TriangleAlert } from "lucide-preact";

type Shift = "shiftMorning" | "shiftAfternoon" | "shiftNight" | "shiftOff";

const SHIFT_TIMES: Record<Exclude<Shift, "shiftOff">, string> = {
	shiftMorning: "07:00-15:00",
	shiftAfternoon: "15:00-23:00",
	shiftNight: "23:00-07:00",
};

/** Sample roster, Monday first. Same sample guards as Today's "Guards on duty". */
const SAMPLE_ROSTER: { guard: string; week: Shift[] }[] = [
	{
		guard: "Budi Santoso",
		week: [
			"shiftMorning",
			"shiftMorning",
			"shiftMorning",
			"shiftOff",
			"shiftAfternoon",
			"shiftAfternoon",
			"shiftOff",
		],
	},
	{
		guard: "Siti Rahma",
		week: [
			"shiftAfternoon",
			"shiftAfternoon",
			"shiftOff",
			"shiftMorning",
			"shiftMorning",
			"shiftOff",
			"shiftNight",
		],
	},
	{
		guard: "Agus Pratama",
		week: [
			"shiftNight",
			"shiftNight",
			"shiftNight",
			"shiftNight",
			"shiftOff",
			"shiftOff",
			"shiftMorning",
		],
	},
	{
		guard: "Dewi Lestari",
		week: [
			"shiftOff",
			"shiftOff",
			"shiftAfternoon",
			"shiftAfternoon",
			"shiftNight",
			"shiftNight",
			"shiftAfternoon",
		],
	},
];

export function Schedule() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const days = weekKeys(today);

	return (
		<>
			<div class="flex flex-wrap items-start justify-between gap-3 mb-3">
				<div>
					<h1 class="text-xl font-bold">{t("navSchedule")}</h1>
					<p class="text-muted">
						{t("scheduleWeekOf", {
							date: formatLongDate(days[0], lang),
						})}
					</p>
				</div>
				<button
					type="button"
					class="btn btn-primary"
					disabled
					title={t("notAvailableYet")}>
					<CalendarPlus
						size={ICON}
						aria-hidden="true"
					/>
					{t("addShift")}
				</button>
			</div>

			<p
				class="notice notice-soon mb-4 flex items-start gap-2"
				role="note">
				<TriangleAlert
					size={ICON}
					class="shrink-0 mt-0.5"
					aria-hidden="true"
				/>
				{t("scheduleSample")}
			</p>

			<ul
				class="shift-legend mb-4"
				aria-label={t("shiftLegend")}>
				{(Object.keys(SHIFT_TIMES) as (keyof typeof SHIFT_TIMES)[]).map(
					(s) => (
						<li key={s}>
							<span class={`shift-chip is-${s}`}>{t(s)}</span>
							<span class="text-muted tabular-nums">
								{SHIFT_TIMES[s]}
							</span>
						</li>
					),
				)}
				<li>
					<span class="shift-chip is-shiftOff">{t("shiftOff")}</span>
				</li>
			</ul>

			<div class="table-wrap">
				<table class="log-table roster-table">
					<thead>
						<tr>
							<th scope="col">{t("guard")}</th>
							{days.map((d) => (
								<th
									key={d}
									scope="col"
									class={d === today ? "is-today" : ""}
									aria-current={
										d === today ? "date" : undefined
									}>
									{formatShortDay(d, lang)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{SAMPLE_ROSTER.map((row) => (
							<tr key={row.guard}>
								<th
									scope="row"
									class="font-medium">
									{row.guard}
								</th>
								{row.week.map((s, i) => (
									<td
										key={days[i]}
										class={
											days[i] === today ? "is-today" : ""
										}>
										<span class={`shift-chip is-${s}`}>
											{t(s)}
										</span>
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</>
	);
}
