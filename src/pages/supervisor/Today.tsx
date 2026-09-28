/**
 * The Today tab, the supervisor's start page: how today's patrol is going, in four sections.
 *   - Completed checkpoints and Not yet visited: live, from today's scans (lib/today.ts).
 *   - Guards on duty: layout only, with sample data for now (TODO below).
 *   - Needs review: not built yet (TODO below).
 * Refreshes itself every minute, and on the refresh button.
 *
 * Layout (index.css, .today-grid): on a wide screen, the two checkpoint sections stack in a left
 * column 2/3 wide; Needs review sits above Guards on duty on the right, each as tall as the left
 * card beside it. Each
 * section scrolls inside itself. Narrower screens get one column, most urgent first.
 */
import { useEffect, useState } from "preact/hooks";
import { Link } from "wouter-preact";
import type { ComponentChildren } from "preact";
import type { LucideIcon } from "lucide-preact";
import {
	MapPinCheck,
	MapPinX,
	RefreshCw,
	ShieldUser,
	TriangleAlert,
} from "lucide-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatLongDate, formatTime, localDateKey } from "../../lib/format";
import { todayCheckpoints } from "../../lib/today";
import { LocationBadge } from "../../components/LocationBadge";
import { IconButton } from "../../components/IconButton";
import { LoadError } from "./Log";

/** How often the page fetches fresh data while it's open. */
const REFRESH_MS = 60_000;

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

	return (
		<>
			<header class="today-header">
				<div class="min-w-0 flex-1">
					<h1 class="text-2xl font-bold">{t("navToday")}</h1>
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
				<IconButton
					icon={RefreshCw}
					label={t("refresh")}
					tip={t("refreshTodayTip")}
					class={`icon-btn-lg ${data.loading ? "is-spinning" : ""}`}
					disabled={data.loading}
					onClick={() => data.reload()}
				/>
			</header>

			{data.error && (
				<div class="mb-4">
					<LoadError onRetry={data.reload} />
				</div>
			)}

			{/* DOM order = phone order (most urgent first); wide screens place them by grid area. */}
			<div class="today-grid">
				<OverviewCard
					area="review"
					tone="review"
					icon={TriangleAlert}
					title={t("reviewTitle")}
					description={t("reviewDesc")}>
					{/*
						TODO: implement Needs review. List today's scans that need a supervisor's look,
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
					<p class="overview-empty">{t("reviewSoon")}</p>
				</OverviewCard>

				<OverviewCard
					area="missed"
					tone="missed"
					icon={MapPinX}
					title={t("notVisitedTitle")}
					description={t("notVisitedDesc")}
					count={
						sections &&
						t("countOf", {
							n: sections.notVisited.length,
							total: sections.total,
						})
					}>
					{sections &&
						(sections.notVisited.length === 0 ? (
							<p class="overview-empty">{t("allVisited")}</p>
						) : (
							<table class="overview-table">
								<thead>
									<tr>
										<th scope="col">{t("colStop")}</th>
										<th scope="col">{t("checkpoint")}</th>
										<th scope="col">{t("colLocation")}</th>
									</tr>
								</thead>
								<tbody>
									{sections.notVisited.map((c) => (
										<tr key={c.id}>
											<td class="tabular-nums">
												{c.routeOrder}
											</td>
											<td>{c.name}</td>
											<td class="whitespace-nowrap text-muted">
												{t(
													c.location
														? "pinnedOnMap"
														: "locationNotSet",
												)}
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
					count={
						sections &&
						t("countOf", {
							n: sections.completed.length,
							total: sections.total,
						})
					}>
					{sections &&
						(sections.completed.length === 0 ? (
							<p class="overview-empty">{t("noneCompleted")}</p>
						) : (
							<table class="overview-table">
								<thead>
									<tr>
										<th scope="col">{t("colStop")}</th>
										<th scope="col">{t("checkpoint")}</th>
										<th scope="col">{t("colLastScan")}</th>
										{/* Hidden on phones, with Scans, so Location still fits. */}
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
											<tr key={c.id}>
												<td class="tabular-nums">
													{c.routeOrder}
												</td>
												<td>{c.name}</td>
												<td class="tabular-nums whitespace-nowrap">
													<Link
														href={`/supervisor/scans/${s.id}`}
														class="underline">
														{formatTime(
															s.scannedAt,
															lang,
														)}
													</Link>
												</td>
												<td class="hidden sm:table-cell">
													{s.guardName}
												</td>
												<td class="hidden sm:table-cell tabular-nums">
													{scans}
												</td>
												<td class="whitespace-nowrap">
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
					badge={t("sampleData")}>
					<GuardsOnDuty />
				</OverviewCard>
			</div>
			{data.loading && !data.data && (
				<p class="mt-4 text-muted">{t("loading")}</p>
			)}
		</>
	);
}

type Tone = "done" | "missed" | "duty" | "review";

/** One of the four sections: a coloured header with icon and count, a line of description, then its content. */
function OverviewCard({
	area,
	tone,
	icon: Icon,
	title,
	description,
	count,
	badge,
	children,
}: {
	/** Where it goes in the wide-screen grid (index.css, .today-grid). */
	area: "done" | "missed" | "duty" | "review";
	tone: Tone;
	icon: LucideIcon;
	title: string;
	description: string;
	/** e.g. "3 of 9", shown beside the title. */
	count?: string | null;
	/** A warning tag, e.g. "Sample data". */
	badge?: string;
	children: ComponentChildren;
}) {
	const id = `overview-${area}`;
	return (
		<section
			class={`overview-card tone-${tone} area-${area}`}
			aria-labelledby={id}>
			<div class="overview-head">
				<Icon
					size={22}
					aria-hidden="true"
				/>
				<h2 id={id}>{title}</h2>
				{count && <span class="overview-count">{count}</span>}
				{badge && <span class="overview-badge">{badge}</span>}
			</div>
			<p class="overview-desc">{description}</p>
			<div class="overview-body">{children}</div>
		</section>
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

function GuardsOnDuty() {
	const { t } = useApp();
	return (
		<table class="overview-table">
			<thead>
				<tr>
					<th scope="col">{t("guard")}</th>
					<th scope="col">{t("colStatus")}</th>
					<th scope="col">{t("colScans")}</th>
					<th scope="col">{t("colLastScan")}</th>
				</tr>
			</thead>
			<tbody>
				{SAMPLE_GUARDS.map((g) => (
					<tr key={g.name}>
						<td>{g.name}</td>
						<td>
							<span class={`guard-status is-${g.status}`}>
								{t(g.status)}
							</span>
						</td>
						<td class="tabular-nums">{g.scans}</td>
						<td class="tabular-nums text-muted">
							{g.lastScan ?? "-"}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
