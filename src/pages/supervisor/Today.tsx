/**
 * The Today tab, the supervisor's start page: how today's patrol is going, in four sections.
 *   - Completed checkpoints and Not yet visited: live, from today's scans (lib/today.ts).
 *   - Guards on duty: layout only, with sample data for now (TODO below).
 *   - Needs review: not built yet (TODO below).
 * Refreshes itself every minute, and on the refresh button.
 *
 * Layout (index.css, "Today dashboard"): a row of count tiles that jump to their section, then the
 * four section cards. Phones get one column, most urgent first; tablets two; wide screens three,
 * with Needs review beside Guards on duty and Not yet visited beside Completed. Below desktop
 * width a card shows its first rows and a "Show all" button instead of scrolling inside itself.
 */
import { useEffect, useState } from "preact/hooks";
import { Link } from "wouter-preact";
import type { ComponentChildren } from "preact";
import type { LucideIcon } from "lucide-preact";
import {
	ChevronDown,
	ChevronUp,
	Clock,
	MapPin,
	MapPinCheck,
	MapPinOff,
	MapPinX,
	MessageSquareText,
	RefreshCw,
	ShieldUser,
	Timer,
	TriangleAlert,
} from "lucide-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatLongDate, formatTime, localDateKey } from "../../lib/format";
import { todayCheckpoints } from "../../lib/today";
import { LocationBadge } from "../../components/LocationBadge";
import { ICON } from "../../components/IconButton";
import { LoadError } from "./Log";

/** How often the page fetches fresh data while it's open. */
const REFRESH_MS = 60_000;

type Area = "done" | "missed" | "duty" | "review";
type Tone = "done" | "pending" | "duty" | "review";

/** Scrolls to a section card and moves focus to it, for the count tiles. */
function jumpTo(area: Area) {
	const el = document.getElementById(`today-${area}`);
	if (!el) return;
	const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	el.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
	el.focus({ preventScroll: true });
}

export function Today() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const data = useAsync(
		() =>
			Promise.all([
				api.allCheckpoints(),
				api.exportScans({ date: today }),
			]),
		[today],
	);
	const { reload } = data;
	const [updatedAt, setUpdatedAt] = useState<string | null>(null);

	useEffect(() => {
		if (data.data) setUpdatedAt(new Date().toISOString());
	}, [data.data]);

	// Keep the page current while it's open; skip the fetch when the tab is in the background.
	useEffect(() => {
		const id = setInterval(() => {
			if (document.visibilityState === "visible") reload();
		}, REFRESH_MS);
		return () => clearInterval(id);
	}, [reload]);

	const sections = data.data
		? todayCheckpoints(data.data[0], data.data[1])
		: null;
	const scansLabel = (n: number) =>
		t(n === 1 ? "scanOne" : "scanMany", { n });

	return (
		<>
			<header class="today-header">
				<div class="min-w-0 flex-1">
					<h1 class="dash-title">{t("navToday")}</h1>
					<p class="text-muted">
						{formatLongDate(today, lang)}
						{updatedAt && (
							<>
								{" · "}
								{t("todayUpdated", {
									time: formatTime(updatedAt, lang),
								})}
							</>
						)}
					</p>
				</div>
				<button
					type="button"
					class={`btn btn-quiet dash-refresh ${data.loading ? "is-spinning" : ""}`}
					data-tip={t("refreshTodayTip")}
					disabled={data.loading}
					onClick={() => data.reload()}>
					<RefreshCw
						size={ICON}
						aria-hidden="true"
					/>
					<span class="max-sm:sr-only">{t("refresh")}</span>
				</button>
			</header>

			{data.error && (
				<div class="mb-4">
					<LoadError onRetry={data.reload} />
				</div>
			)}

			<ul
				class="dash-stats"
				aria-label={t("todayAtAGlance")}>
				<StatTile
					area="review"
					tone="review"
					icon={TriangleAlert}
					value={String(SAMPLE_REVIEW.length)}
					label={t("tileReview")}
					sample
				/>
				<StatTile
					area="missed"
					tone="pending"
					icon={MapPinX}
					value={sections ? String(sections.notVisited.length) : "-"}
					label={t("tileNotVisited")}
				/>
				<StatTile
					area="done"
					tone="done"
					icon={MapPinCheck}
					value={
						sections
							? `${sections.completed.length}/${sections.total}`
							: "-"
					}
					label={t("tileDone")}
				/>
				<StatTile
					area="duty"
					tone="duty"
					icon={ShieldUser}
					value={String(SAMPLE_GUARDS.length)}
					label={t("tileGuards")}
					sample
				/>
			</ul>

			{/* DOM order = phone order (most urgent first); wider screens place them by grid area. */}
			<div class="dash-grid">
				<OverviewCard
					area="review"
					tone="review"
					icon={TriangleAlert}
					title={t("reviewTitle")}
					description={t("reviewDesc")}
					badge={t("sampleData")}
					rows={SAMPLE_REVIEW.length}>
					{/*
						TODO: implement Needs review (it shows sample data, tagged as such, until then).
						List today's scans that need a supervisor's look,
						newest first, each with its reasons as labels and a link to the scan:
						  - far from the checkpoint (location_status = 'far')
						  - no GPS (location_status = 'no_fix')
						  - has a report (the guard wrote a note or added photos: likely an incident)
						  - sent late: received_at more than 60 min after scanned_at (long offline, or a
						    wrong phone clock)
						  - too fast: the same guard scanned two different checkpoints less than 1 min apart
						Not included on purpose: "no report" (reports are optional, so it would flag almost
						every scan) and "checkpoint not pinned" (a setup issue, not the guard's).
						Put the thresholds in one constants block, and the rules in lib/today.ts with tests.
						Later: a "Mark as reviewed" action (needs reviewed_at / reviewed_by on scans).
						See README > TODO.
					*/}
					<NeedsReview />
				</OverviewCard>

				<OverviewCard
					area="missed"
					tone="pending"
					icon={MapPinX}
					title={t("notVisitedTitle")}
					description={t("notVisitedDesc")}
					rows={sections?.notVisited.length ?? 0}
					count={
						sections &&
						t("countOf", {
							n: sections.notVisited.length,
							total: sections.total,
						})
					}>
					{sections &&
						(sections.notVisited.length === 0 ? (
							<p class="dash-empty">{t("allVisited")}</p>
						) : (
							<table class="dash-table">
								<thead>
									<tr>
										<th
											scope="col"
											class="c-stop">
											{t("colStop")}
										</th>
										<th scope="col">{t("checkpoint")}</th>
										<th scope="col">{t("colLocation")}</th>
									</tr>
								</thead>
								<tbody>
									{sections.notVisited.map((c) => (
										<tr key={c.id}>
											<td class="c-stop">
												<span class="stop-badge">
													{c.routeOrder}
												</span>
											</td>
											<td>
												<span class="dash-name">
													{c.name}
												</span>
											</td>
											<td class="c-end">
												<span class="loc-line">
													{c.location ? (
														<MapPin
															size={15}
															aria-hidden="true"
														/>
													) : (
														<MapPinOff
															size={15}
															aria-hidden="true"
														/>
													)}
													{t(
														c.location
															? "pinnedOnMap"
															: "locationNotSet",
													)}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						))}
				</OverviewCard>

				<OverviewCard
					area="done"
					tone="done"
					icon={MapPinCheck}
					title={t("completedTitle")}
					description={t("completedDesc")}
					rows={sections?.completed.length ?? 0}
					count={
						sections &&
						t("countOf", {
							n: sections.completed.length,
							total: sections.total,
						})
					}>
					{sections &&
						(sections.completed.length === 0 ? (
							<p class="dash-empty">{t("noneCompleted")}</p>
						) : (
							<table class="dash-table">
								<thead>
									<tr>
										<th
											scope="col"
											class="c-stop">
											{t("colStop")}
										</th>
										<th scope="col">{t("checkpoint")}</th>
										{/* On phones these three fold into a line under the name. */}
										<th
											scope="col"
											class="hidden sm:table-cell">
											{t("colLastScan")}
										</th>
										<th
											scope="col"
											class="hidden sm:table-cell">
											{t("colBy")}
										</th>
										<th
											scope="col"
											class="hidden sm:table-cell">
											{t("colScans")}
										</th>
										<th scope="col">{t("colLocation")}</th>
									</tr>
								</thead>
								<tbody>
									{sections.completed.map(
										({
											checkpoint: c,
											lastScan: s,
											scans,
										}) => (
											<tr
												key={c.id}
												class="has-link">
												<td class="c-stop">
													<span class="stop-badge">
														{c.routeOrder}
													</span>
												</td>
												<td>
													{/* The link covers the whole row (index.css, .row-link). */}
													<Link
														href={`/supervisor/scans/${s.id}`}
														class="row-link dash-name">
														{c.name}
													</Link>
													<span class="dash-sub tabular-nums sm:hidden">
														{formatTime(
															s.scannedAt,
															lang,
														)}
														{" · "}
														{s.guardName}
														{" · "}
														{scansLabel(scans)}
													</span>
												</td>
												<td class="hidden sm:table-cell tabular-nums whitespace-nowrap">
													{formatTime(
														s.scannedAt,
														lang,
													)}
												</td>
												<td class="hidden sm:table-cell">
													{s.guardName}
												</td>
												<td class="hidden sm:table-cell tabular-nums">
													{scans}
												</td>
												<td class="c-end">
													<LocationBadge scan={s} />
												</td>
											</tr>
										),
									)}
								</tbody>
							</table>
						))}
				</OverviewCard>

				<OverviewCard
					area="duty"
					tone="duty"
					icon={ShieldUser}
					title={t("guardsTitle")}
					description={t("guardsDesc")}
					badge={t("sampleData")}
					rows={SAMPLE_GUARDS.length}>
					<GuardsOnDuty scansLabel={scansLabel} />
				</OverviewCard>
			</div>
			{data.loading && !data.data && (
				<p class="mt-4 text-muted">{t("loading")}</p>
			)}
		</>
	);
}

/** A count at the top of the page. Selecting it jumps to its section. */
function StatTile({
	area,
	tone,
	icon: Icon,
	value,
	label,
	sample,
}: {
	area: Area;
	tone: Tone;
	icon: LucideIcon;
	value: string;
	label: string;
	/** The number comes from sample data, so the tile says so. */
	sample?: boolean;
}) {
	const { t } = useApp();
	return (
		<li>
			<button
				type="button"
				class={`stat-tile tone-${tone}`}
				onClick={() => jumpTo(area)}>
				<span class="stat-icon">
					<Icon
						size={20}
						aria-hidden="true"
					/>
				</span>
				<span class="grid min-w-0">
					<span class="stat-value">{value}</span>
					<span class="stat-label">{label}</span>
					{sample && (
						<span class="stat-sample">{t("sampleShort")}</span>
					)}
				</span>
			</button>
		</li>
	);
}

/** Rows a card shows below desktop width before its "Show all" button (index.css keeps this in step). */
const ROWS_SHOWN = 5;

/** One of the four sections: a coloured header with icon and count, a line of description, then its content. */
function OverviewCard({
	area,
	tone,
	icon: Icon,
	title,
	description,
	count,
	badge,
	rows,
	children,
}: {
	/** Where it goes in the wide-screen grid (index.css, .dash-grid). */
	area: Area;
	tone: Tone;
	icon: LucideIcon;
	title: string;
	description: string;
	/** e.g. "3 of 9", shown beside the title. */
	count?: string | null;
	/** A warning tag, e.g. "Sample data". */
	badge?: string;
	/** How many rows the table has, to offer "Show all" when some are folded away. */
	rows: number;
	children: ComponentChildren;
}) {
	const { t } = useApp();
	const [expanded, setExpanded] = useState(false);
	const headingId = `today-${area}-h`;
	return (
		<section
			id={`today-${area}`}
			tabIndex={-1}
			class={`dash-card tone-${tone} area-${area} ${expanded ? "is-expanded" : ""}`}
			aria-labelledby={headingId}>
			<div class="dash-head">
				<Icon
					size={22}
					class="dash-icon"
					aria-hidden="true"
				/>
				<div class="min-w-0 flex-1">
					<h2 id={headingId}>{title}</h2>
					<p class="dash-desc">{description}</p>
					{badge && <span class="dash-badge">{badge}</span>}
				</div>
				{count && <span class="dash-count">{count}</span>}
			</div>
			<div class="dash-body">{children}</div>
			{rows > ROWS_SHOWN && (
				<button
					type="button"
					class="dash-more"
					aria-expanded={expanded}
					onClick={() => setExpanded((e) => !e)}>
					{expanded ? (
						<ChevronUp
							size={ICON}
							aria-hidden="true"
						/>
					) : (
						<ChevronDown
							size={ICON}
							aria-hidden="true"
						/>
					)}
					{expanded ? t("showFewer") : t("showAll", { n: rows })}
				</button>
			)}
		</section>
	);
}

type ReviewReason =
	| "reasonFar"
	| "reasonNoGps"
	| "reasonReport"
	| "reasonLate"
	| "reasonTooFast";

const REASON_ICON: Record<ReviewReason, LucideIcon> = {
	reasonFar: MapPin,
	reasonNoGps: MapPinOff,
	reasonReport: MessageSquareText,
	reasonLate: Clock,
	reasonTooFast: Timer,
};

/*
	Sample data for Needs review, one row per planned reason (see the TODO in the card above).
	The detail is what the real rule would show: distance, delay, or gap since the last scan.
*/
const SAMPLE_REVIEW: {
	time: string;
	guard: string;
	checkpoint: string;
	reason: ReviewReason;
	detail?: string;
}[] = [
	{
		time: "17:05",
		guard: "Budi Santoso",
		checkpoint: "Pintu samping timur",
		reason: "reasonFar",
		detail: "5.6 km",
	},
	{
		time: "16:42",
		guard: "Siti Rahma",
		checkpoint: "Parkir basement B1",
		reason: "reasonNoGps",
	},
	{
		time: "15:20",
		guard: "Agus Pratama",
		checkpoint: "Gudang belakang",
		reason: "reasonReport",
	},
	{
		time: "14:58",
		guard: "Budi Santoso",
		checkpoint: "Tangga darurat lantai 2",
		reason: "reasonLate",
		detail: "+2 h 10 min",
	},
	{
		time: "14:31",
		guard: "Siti Rahma",
		checkpoint: "Ruang panel listrik",
		reason: "reasonTooFast",
		detail: "40 s",
	},
];

function NeedsReview() {
	const { t } = useApp();
	return (
		<table class="dash-table">
			<thead>
				<tr>
					<th scope="col">{t("time")}</th>
					<th scope="col">{t("colScan")}</th>
					<th scope="col">{t("colReason")}</th>
				</tr>
			</thead>
			<tbody>
				{SAMPLE_REVIEW.map((r) => {
					const Icon = REASON_ICON[r.reason];
					return (
						<tr key={`${r.time}-${r.reason}`}>
							<td class="tabular-nums font-bold">{r.time}</td>
							{/* Checkpoint and guard share a cell, so the table fits a phone. */}
							<td>
								<span class="dash-name">{r.checkpoint}</span>
								<span class="dash-sub">{r.guard}</span>
							</td>
							<td class="c-end">
								<span class="reason-chip">
									<Icon
										size={13}
										aria-hidden="true"
									/>
									{t(r.reason)}
								</span>
								{r.detail && (
									<span class="dash-sub tabular-nums">
										{r.detail}
									</span>
								)}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

type GuardStatus = "guardPatrolling" | "guardQuiet" | "guardNotStarted";

/*
	TODO: implement Guards on duty with real data (this is sample data, and the card says so).
	List every active guard (guardSummaries(today) already returns name, scans today, last scan),
	with a status worked out from the last scan:
	  - Patrolling: scanned in the last 60 minutes
	  - Quiet: scanned today, but not in the last 60 minutes
	  - Not started: no scans today
	The app has no shift schedule yet, so "on duty" can't mean "scheduled"; see README > TODO.
*/
const SAMPLE_GUARDS: {
	name: string;
	status: GuardStatus;
	scans: number;
	lastScan: string | null;
}[] = [
	{
		name: "Budi Santoso",
		status: "guardPatrolling",
		scans: 6,
		lastScan: "17:32",
	},
	{ name: "Agus Pratama", status: "guardQuiet", scans: 3, lastScan: "14:05" },
	{ name: "Siti Rahma", status: "guardNotStarted", scans: 0, lastScan: null },
];

/** Up to two initials for an avatar: "Budi Santoso" -> "BS". */
const initials = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();

function GuardsOnDuty({ scansLabel }: { scansLabel: (n: number) => string }) {
	const { t } = useApp();
	return (
		<table class="dash-table">
			<thead>
				<tr>
					<th scope="col">{t("guard")}</th>
					<th scope="col">{t("colStatus")}</th>
				</tr>
			</thead>
			<tbody>
				{SAMPLE_GUARDS.map((g) => (
					<tr key={g.name}>
						<td class="guard-cell">
							<span
								class="guard-avatar"
								aria-hidden="true">
								{initials(g.name)}
							</span>
							<span class="dash-name">{g.name}</span>
							<span class="dash-sub tabular-nums">
								{g.lastScan
									? t("guardSummary", {
											scans: scansLabel(g.scans),
											time: g.lastScan,
										})
									: t("guardNoScans")}
							</span>
						</td>
						<td class="c-end">
							<span class={`guard-status is-${g.status}`}>
								{t(g.status)}
							</span>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
