/**
 * The Today tab, the supervisor's start page: how today's patrol is going, in four sections, all
 * worked out from today's scans (rules in lib/today.ts): Needs review, Not yet visited, Completed
 * checkpoints and Guards on duty.
 * Refreshes itself every minute while it's on screen, as soon as it's back on screen after that,
 * and on the refresh button.
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
import {
	formatDistance,
	formatLongDate,
	formatTime,
	localDateKey,
} from "../../lib/format";
import {
	guardsOnDuty,
	needsReview,
	todayCheckpoints,
	type GuardOnDuty,
	type ReviewFlag,
	type ReviewItem,
	type ReviewReason,
} from "../../lib/today";
import type { Lang } from "../../i18n";
import { initials } from "../../lib/personName";
import { LocationBadge } from "../../components/LocationBadge";
import { ICON, IconLink } from "../../components/IconButton";
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
				api.guardSummaries(today),
			]),
		[today],
	);
	const { reload } = data;
	const [updatedAt, setUpdatedAt] = useState<string | null>(null);

	useEffect(() => {
		if (data.data) setUpdatedAt(new Date().toISOString());
	}, [data.data]);

	// Keep the page current while it's open; skip the fetch when the tab is in the background, and
	// catch up as soon as it's back if a refresh was missed. Statuses that depend on the time
	// (Patrolling) are worked out again with each fetch.
	useEffect(() => {
		let last = Date.now();
		const refresh = () => {
			last = Date.now();
			reload();
		};
		const id = setInterval(() => {
			if (document.visibilityState === "visible") refresh();
		}, REFRESH_MS);
		const onShow = () => {
			if (
				document.visibilityState === "visible" &&
				Date.now() - last >= REFRESH_MS
			)
				refresh();
		};
		document.addEventListener("visibilitychange", onShow);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", onShow);
		};
	}, [reload]);

	const sections = data.data
		? todayCheckpoints(data.data[0], data.data[1])
		: null;
	const review = data.data ? needsReview(data.data[1]) : null;
	const guards = data.data ? guardsOnDuty(data.data[2]) : null;
	const patrolling =
		guards?.filter((g) => g.status === "guardPatrolling").length ?? 0;
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
					value={review ? String(review.length) : "-"}
					label={t("tileReview")}
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
					value={guards ? `${patrolling}/${guards.length}` : "-"}
					label={t("tileGuards")}
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
					rows={review?.length ?? 0}>
					{review &&
						(review.length === 0 ? (
							<p class="dash-empty">{t("nothingToReview")}</p>
						) : (
							<NeedsReview items={review} />
						))}
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
												{/* Opens the Map on this checkpoint; Back returns here. */}
												{c.location ? (
													<IconLink
														icon={MapPin}
														label={t("showOnMap", {
															name: c.name,
														})}
														href={`/supervisor/map/checkpoint/${c.id}`}
													/>
												) : (
													<span class="loc-line">
														<MapPinOff
															size={15}
															aria-hidden="true"
														/>
														{t("locationNotSet")}
													</span>
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
					rows={guards?.length ?? 0}
					count={
						guards &&
						guards.length > 0 &&
						t("patrollingCount", {
							n: patrolling,
							total: guards.length,
						})
					}>
					{guards &&
						(guards.length === 0 ? (
							<p class="dash-empty">{t("noGuards")}</p>
						) : (
							<GuardsOnDuty
								guards={guards}
								scansLabel={scansLabel}
							/>
						))}
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
}: {
	area: Area;
	tone: Tone;
	icon: LucideIcon;
	value: string;
	label: string;
}) {
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
	count?: string | false | null;
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

const REASON_ICON: Record<ReviewReason, LucideIcon> = {
	reasonFar: MapPin,
	reasonNoGps: MapPinOff,
	reasonReport: MessageSquareText,
	reasonLate: Clock,
	reasonTooFast: Timer,
};

type Translate = ReturnType<typeof useApp>["t"];

/** A length of time, roughly: "40 s", "25 min", "2 h 10 min". */
function formatSpan(ms: number, t: Translate) {
	// Rounded up, so a gap of a split second reads "1 s", not "0 s".
	const s = Math.max(0, Math.ceil(ms / 1000));
	if (s < 60) return t("spanSeconds", { s });
	const m = Math.floor(s / 60);
	if (m < 60) return t("spanMinutes", { m });
	return t("spanHours", { h: Math.floor(m / 60), m: m % 60 });
}

/** The detail under a reason: how far, how late, or how soon after the guard's previous scan. */
function flagDetail(f: ReviewFlag, t: Translate, lang: Lang): string | null {
	if (f.amount === undefined) return null;
	if (f.reason === "reasonFar") return formatDistance(f.amount, lang);
	if (f.reason === "reasonLate") return `+${formatSpan(f.amount, t)}`;
	return formatSpan(f.amount, t);
}

function NeedsReview({ items }: { items: ReviewItem[] }) {
	const { t, lang } = useApp();
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
				{items.map(({ scan: s, flags }) => (
					<tr
						key={s.id}
						class="has-link">
						<td class="tabular-nums font-bold">
							{formatTime(s.scannedAt, lang)}
						</td>
						{/* Checkpoint and guard share a cell, so the table fits a phone. */}
						<td>
							{/* The link covers the whole row (index.css, .row-link). */}
							<Link
								href={`/supervisor/scans/${s.id}`}
								class="row-link dash-name">
								{s.checkpointName}
							</Link>
							<span class="dash-sub">{s.guardName}</span>
						</td>
						<td class="c-end">
							<span class="reason-list">
								{flags.map((f) => {
									const Icon = REASON_ICON[f.reason];
									const detail = flagDetail(f, t, lang);
									return (
										<span
											key={f.reason}
											class="reason">
											<span class="reason-chip">
												<Icon
													size={13}
													aria-hidden="true"
												/>
												{t(f.reason)}
											</span>
											{detail && (
												<span class="dash-sub tabular-nums">
													{detail}
												</span>
											)}
										</span>
									);
								})}
							</span>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function GuardsOnDuty({
	guards,
	scansLabel,
}: {
	guards: GuardOnDuty[];
	scansLabel: (n: number) => string;
}) {
	const { t, lang } = useApp();
	return (
		<table class="dash-table">
			<thead>
				<tr>
					<th scope="col">{t("guard")}</th>
					<th scope="col">{t("colStatus")}</th>
				</tr>
			</thead>
			<tbody>
				{guards.map((g) => (
					<tr key={g.guardId}>
						<td class="guard-cell">
							<span
								class="guard-avatar"
								aria-hidden="true">
								{initials(g.guardName)}
							</span>
							<span class="dash-name">{g.guardName}</span>
							<span class="dash-sub tabular-nums">
								{g.lastScanAt
									? t("guardSummary", {
											scans: scansLabel(g.scansToday),
											time: formatTime(
												g.lastScanAt,
												lang,
											),
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
