/**
 * The Schedule tab: manual scheduling. A supervisor picks a day and a shift (Morning, Afternoon,
 * Night) and chooses which guards work it; the app saves each guard's shift and warns about
 * problems instead of deciding anything itself (rules in lib/schedule.ts):
 *   - more hours in a week than the limit, too little rest between two shifts
 *   - shifts nobody works
 * Moves between weeks, and "Copy last week" repeats the previous week's shifts. Days before today
 * are history: shown, but read-only (the database refuses changes to them too).
 *
 * Layout (index.css, "Schedule"): on desktop (1024px and up) a grid, one row per shift and one
 * column per day, like the design's DeskSchedule board; below that a strip of days and one card
 * per shift for the chosen day (the Schedule board). Assigning opens the same dialog on both.
 *
 * TODO: shift times are the sample's (07-15, 15-23, 23-07) until the owner decides; which
 * checkpoints each shift covers (routes), and using shifts on Today and the guard's home screen,
 * wait on the owner's decisions. See README > Status and TODO > Not decided yet.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync, useMediaQuery } from "../../hooks";
import * as api from "../../data/api";
import {
	formatLongDate,
	formatShortDay,
	formatTime,
	localDateKey,
	weekKeys,
} from "../../lib/format";
import {
	SCHEDULE_RULES,
	SHIFT_KINDS,
	addDays,
	emptySlots,
	scheduleWarnings,
	shiftDay,
	shiftHours,
	shiftKind,
	shiftTimes,
	shiftsBySlot,
	slotKey,
	type ScheduleWarning,
	type ShiftKind,
} from "../../lib/schedule";
import { initials } from "../../lib/personName";
import { LoadError } from "./Log";
import { ICON, IconButton } from "../../components/IconButton";
import {
	CalendarCheck,
	ChevronLeft,
	ChevronRight,
	Copy,
	Plus,
	TriangleAlert,
	X,
} from "lucide-preact";
import type { Shift, User } from "../../types";

/** Local midnight at the start of a day, as an ISO time. */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();

interface Slot {
	day: string;
	kind: ShiftKind;
}

export function Schedule() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const desktop = useMediaQuery("(min-width: 1024px)");
	const [weekOf, setWeekOf] = useState(today);
	const days = weekKeys(weekOf);
	const weekStart = dayStart(days[0]);
	const weekEnd = dayStart(addDays(days[6], 1));
	const thisWeek = days.includes(today);

	// The week's shifts plus the day either side, so rest before Monday and after Sunday counts.
	const data = useAsync(
		() =>
			Promise.all([
				api.listShifts(
					dayStart(addDays(days[0], -1)),
					dayStart(addDays(days[6], 2)),
				),
				api.listAccounts(),
			]),
		[days[0]],
	);
	const all = data.data?.[0] ?? [];
	const shifts = all.filter(
		(s) => s.startsAt >= weekStart && s.startsAt < weekEnd,
	);
	const guards: User[] = (data.data?.[1] ?? []).filter(
		(a) => a.role === "guard" && a.active,
	);
	const slots = shiftsBySlot(shifts);
	const warnings = scheduleWarnings(all, weekStart, weekEnd);
	// Past days can't be changed any more, so only today and later count as empty.
	const isPast = (d: string) => d < today;
	const empty = emptySlots(
		shifts,
		days.filter((d) => !isPast(d)),
	);
	const weekPast = isPast(days[6]);
	const dayClass = (d: string) =>
		d === today ? "is-today" : isPast(d) ? "is-past" : "";
	const others = shifts.filter((s) => shiftKind(s) === null);

	// Phones show one day at a time: today in this week, else Monday.
	const [day, setDay] = useState(today);
	const shownDay = days.includes(day) ? day : thisWeek ? today : days[0];

	const [assigning, setAssigning] = useState<Slot | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [copying, setCopying] = useState(false);

	function moveWeek(n: number) {
		setWeekOf(n === 0 ? today : addDays(days[0], n * 7));
		setMessage(null);
	}

	async function copyLastWeek() {
		setCopying(true);
		setMessage(null);
		try {
			const n = await api.copyShifts(
				dayStart(addDays(days[0], -7)),
				weekStart,
			);
			setMessage(
				n === 0
					? t("copiedNone")
					: n === 1
						? t("copiedShift")
						: t("copiedShifts", { n }),
			);
			data.reload();
		} catch {
			setMessage(t("saveError"));
		} finally {
			setCopying(false);
		}
	}

	const slotLabel = (s: Slot) =>
		t("slotLabel", {
			shift: t(s.kind),
			day: formatLongDate(s.day, lang),
		});

	return (
		<section
			class="sched-page"
			aria-labelledby="sched-h">
			<header class="sched-head">
				<div class="min-w-0">
					<h1
						id="sched-h"
						class="dash-title">
						{t("navSchedule")}
					</h1>
					<p class="text-muted">
						{t("scheduleWeekOf", {
							date: formatLongDate(days[0], lang),
						})}
					</p>
				</div>
				<div class="sched-tools">
					<div class="sched-weeknav">
						<IconButton
							icon={ChevronLeft}
							label={t("prevWeek")}
							class="icon-btn-lg"
							onClick={() => moveWeek(-1)}
						/>
						<button
							type="button"
							class="btn btn-quiet"
							disabled={thisWeek}
							onClick={() => moveWeek(0)}>
							<CalendarCheck
								size={ICON}
								aria-hidden="true"
							/>
							{t("thisWeek")}
						</button>
						<IconButton
							icon={ChevronRight}
							label={t("nextWeek")}
							class="icon-btn-lg"
							onClick={() => moveWeek(1)}
						/>
					</div>
					<button
						type="button"
						class="btn btn-outline"
						disabled={copying || !data.data || weekPast}
						title={weekPast ? t("pastWeekTip") : undefined}
						onClick={() => void copyLastWeek()}>
						<Copy
							size={ICON}
							aria-hidden="true"
						/>
						{t("copyLastWeek")}
					</button>
				</div>
			</header>

			{message && (
				<p
					class="notice"
					role="status">
					{message}
				</p>
			)}
			{data.error && <LoadError onRetry={data.reload} />}
			{!data.data && data.loading && (
				<p class="text-muted">{t("loading")}</p>
			)}

			{data.data && (
				<>
					{(warnings.length > 0 || empty.length > 0) && (
						<section
							class="sched-checks"
							aria-labelledby="sched-checks-h">
							<h2 id="sched-checks-h">
								<TriangleAlert
									size={ICON}
									aria-hidden="true"
								/>
								{t("scheduleChecks")}
							</h2>
							<ul>
								{empty.length > 0 && (
									<li>
										{t("emptySlots", { n: empty.length })}
									</li>
								)}
								{warnings.map((w) => (
									<li key={warningKey(w)}>
										<WarningText warning={w} />
									</li>
								))}
							</ul>
						</section>
					)}

					{guards.length === 0 && (
						<p class="notice">{t("noGuards")}</p>
					)}
					{weekPast && <p class="text-muted">{t("pastWeekNote")}</p>}

					{desktop ? (
						<div class="sched-card">
							<table class="sched-grid">
								<thead>
									<tr>
										<th scope="col">{t("shift")}</th>
										{days.map((d) => (
											<th
												key={d}
												scope="col"
												class={dayClass(d)}
												aria-current={
													d === today
														? "date"
														: undefined
												}>
												{formatShortDay(d, lang)}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{SHIFT_KINDS.map(({ kind }) => (
										<tr key={kind}>
											<th scope="row">
												<span class="sched-shift-name">
													{t(kind)}
												</span>
												<span class="text-muted tabular-nums">
													{shiftHours(kind)}
												</span>
											</th>
											{days.map((d) => (
												<td
													key={d}
													class={dayClass(d)}>
													<SlotButton
														label={slotLabel({
															day: d,
															kind,
														})}
														past={isPast(d)}
														guards={
															slots.get(
																slotKey(
																	d,
																	kind,
																),
															) ?? []
														}
														onClick={() =>
															setAssigning({
																day: d,
																kind,
															})
														}
													/>
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<>
							<div
								class="sched-days"
								role="group"
								aria-label={t("chooseDay")}>
								{days.map((d) => (
									<button
										key={d}
										type="button"
										class={`sched-day ${dayClass(d)}`}
										aria-pressed={d === shownDay}
										onClick={() => setDay(d)}>
										{formatShortDay(d, lang)}
									</button>
								))}
							</div>
							{isPast(shownDay) && (
								<p class="text-muted">{t("pastDayNote")}</p>
							)}
							{SHIFT_KINDS.map(({ kind }) => {
								const list =
									slots.get(slotKey(shownDay, kind)) ?? [];
								return (
									<article
										key={kind}
										class={`sched-slot-card ${list.length ? "" : "is-empty"}`}>
										<div class="sched-slot-head">
											<h2>{t(kind)}</h2>
											<span class="text-muted tabular-nums">
												{shiftHours(kind)}
											</span>
										</div>
										{list.length > 0 ? (
											<ul class="sched-guards">
												{list.map((s) => (
													<li key={s.id}>
														<span
															class="guard-avatar"
															aria-hidden="true">
															{initials(
																s.guardName,
															)}
														</span>
														{s.guardName}
													</li>
												))}
											</ul>
										) : (
											<p class="text-muted">
												{t("nobodyAssigned")}
											</p>
										)}
										{/* Past days are read-only: no Assign or Change. */}
										{!isPast(shownDay) && (
											<button
												type="button"
												class="btn btn-outline"
												aria-label={`${t(list.length ? "changeGuards" : "assign")}: ${slotLabel({ day: shownDay, kind })}`}
												onClick={() =>
													setAssigning({
														day: shownDay,
														kind,
													})
												}>
												<Plus
													size={ICON}
													aria-hidden="true"
												/>
												{t(
													list.length
														? "changeGuards"
														: "assign",
												)}
											</button>
										)}
									</article>
								);
							})}
						</>
					)}

					{others.length > 0 && (
						<p class="text-muted">
							{t("otherShifts")}{" "}
							{others
								.map(
									(s) =>
										`${s.guardName} ${formatShortDay(shiftDay(s), lang)} ${formatTime(s.startsAt, lang)}-${formatTime(s.endsAt, lang)}`,
								)
								.join(" · ")}
						</p>
					)}
				</>
			)}

			{assigning && (
				<AssignDialog
					slot={assigning}
					title={slotLabel(assigning)}
					guards={guards}
					shifts={all}
					weekStart={weekStart}
					weekEnd={weekEnd}
					onClose={(saved) => {
						setAssigning(null);
						if (saved) data.reload();
					}}
				/>
			)}
		</section>
	);
}

const warningKey = (w: ScheduleWarning) =>
	w.kind === "overHours" ? `h-${w.guardId}` : `r-${w.shift.id}`;

/** One line of "Check this week". */
function WarningText({ warning: w }: { warning: ScheduleWarning }) {
	const { t, lang } = useApp();
	const h = Math.round(w.hours * 10) / 10;
	if (w.kind === "overHours")
		return (
			<>
				{t("overHoursWarn", {
					name: w.guardName,
					h,
					max: SCHEDULE_RULES.maxWeekHours,
				})}
			</>
		);
	const kind = shiftKind(w.shift);
	return (
		<>
			{t("shortRestWarn", {
				name: w.guardName,
				h,
				shift: kind ? t(kind) : formatTime(w.shift.startsAt, lang),
				day: formatShortDay(shiftDay(w.shift), lang),
			})}
		</>
	);
}

/**
 * A grid cell: the slot's guards, or "Assign"; opens the assign dialog. On a day before today it's
 * disabled: the guards still show, an empty cell shows a dash.
 */
function SlotButton({
	label,
	guards,
	past,
	onClick,
}: {
	label: string;
	guards: Shift[];
	past: boolean;
	onClick: () => void;
}) {
	const { t } = useApp();
	const names = guards.map((s) => s.guardName);
	return (
		<button
			type="button"
			class={`sched-cell ${names.length ? "" : "is-empty"}`}
			disabled={past}
			aria-label={`${label}: ${names.length ? names.join(", ") : t("nobodyAssigned")}. ${t(past ? "pastDay" : names.length ? "changeGuards" : "assign")}`}
			onClick={onClick}>
			{names.length ? (
				<ul>
					{names.map((n) => (
						<li key={n}>{n}</li>
					))}
				</ul>
			) : past ? (
				<span aria-hidden="true">-</span>
			) : (
				<span class="sched-assign">
					<Plus
						size={14}
						aria-hidden="true"
					/>
					{t("assign")}
				</span>
			)}
		</button>
	);
}

/**
 * Choose who works one shift: a tick per active guard, with a warning beside anyone who would get
 * too many hours or too little rest. Save adds and removes the guards that changed.
 */
function AssignDialog({
	slot,
	title,
	guards,
	shifts,
	weekStart,
	weekEnd,
	onClose,
}: {
	slot: Slot;
	title: string;
	guards: User[];
	/** Everything loaded for the week, the day either side included. */
	shifts: Shift[];
	weekStart: string;
	weekEnd: string;
	onClose: (saved: boolean) => void;
}) {
	const { t } = useApp();
	const ref = useRef<HTMLDialogElement>(null);
	const times = shiftTimes(slot.day, slot.kind);
	const inSlot = shifts.filter(
		(s) => shiftDay(s) === slot.day && shiftKind(s) === slot.kind,
	);
	const [chosen, setChosen] = useState(
		() => new Set(inSlot.map((s) => s.guardId)),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		ref.current?.showModal();
	}, []);

	/** What would go wrong for this guard if they worked this shift. */
	function notesFor(g: User): string[] {
		const candidate: Shift = {
			id: "candidate",
			guardId: g.id,
			guardName: g.name,
			...times,
		};
		const theirs = shifts.filter(
			(s) => s.guardId === g.id && !inSlot.includes(s),
		);
		return scheduleWarnings([...theirs, candidate], weekStart, weekEnd)
			.filter(
				(w) =>
					w.kind === "overHours" ||
					w.shift.id === "candidate" ||
					// the shift after this one starts too soon
					Date.parse(w.shift.startsAt) > Date.parse(times.startsAt),
			)
			.map((w) =>
				w.kind === "overHours"
					? t("noteHours", { h: Math.round(w.hours * 10) / 10 })
					: t("noteRest", { h: Math.round(w.hours * 10) / 10 }),
			);
	}

	async function save() {
		setBusy(true);
		setError(null);
		try {
			for (const s of inSlot)
				if (!chosen.has(s.guardId)) await api.removeShift(s.id);
			for (const id of chosen)
				if (!inSlot.some((s) => s.guardId === id))
					await api.assignShift(id, times.startsAt, times.endsAt);
			// Unmounting closes the dialog; closing it here too would report the close twice.
			onClose(true);
		} catch (e) {
			const code = e instanceof Error ? e.message : "";
			setError(
				t(
					code === "shift_overlap"
						? "shiftOverlap"
						: code === "shift_in_past"
							? "shiftInPast"
							: "saveError",
				),
			);
			setBusy(false);
		}
	}

	return (
		<dialog
			ref={ref}
			class="add-dialog sched-dialog"
			aria-labelledby="sched-dialog-h"
			onClose={() => onClose(false)}>
			<div class="add-dialog-head">
				<div class="min-w-0">
					<h2
						id="sched-dialog-h"
						class="text-lg font-bold">
						{title}
					</h2>
					<p class="text-muted tabular-nums">
						{shiftHours(slot.kind)}
					</p>
				</div>
				<IconButton
					icon={X}
					label={t("close")}
					onClick={() => ref.current?.close()}
				/>
			</div>
			<form
				class="sched-dialog-body"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}>
				<fieldset>
					<legend class="font-medium mb-2">
						{t("guardsOnShift")}
					</legend>
					{guards.length === 0 && (
						<p class="text-muted">{t("noGuards")}</p>
					)}
					<ul class="sched-pick">
						{guards.map((g) => {
							const notes = chosen.has(g.id) ? notesFor(g) : [];
							return (
								<li key={g.id}>
									<label>
										<input
											type="checkbox"
											class="size-5"
											checked={chosen.has(g.id)}
											onChange={(e) => {
												const next = new Set(chosen);
												if (e.currentTarget.checked)
													next.add(g.id);
												else next.delete(g.id);
												setChosen(next);
											}}
										/>
										<span
											class="guard-avatar"
											aria-hidden="true">
											{initials(g.name)}
										</span>
										<span class="min-w-0">
											<span class="font-semibold">
												{g.name}
											</span>
											{notes.map((n) => (
												<span
													key={n}
													class="sched-note">
													{n}
												</span>
											))}
										</span>
									</label>
								</li>
							);
						})}
					</ul>
				</fieldset>
				{error && (
					<p
						class="notice notice-warn"
						role="alert">
						{error}
					</p>
				)}
				<div class="sched-dialog-actions">
					<button
						type="button"
						class="btn btn-quiet"
						onClick={() => ref.current?.close()}>
						{t("cancel")}
					</button>
					<button
						type="submit"
						class="btn btn-primary"
						disabled={busy}>
						{busy ? t("saving") : t("save")}
					</button>
				</div>
			</form>
		</dialog>
	);
}
