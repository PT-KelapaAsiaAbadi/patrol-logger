/**
 * The Log Database tab: every scan, newest first, filtered by guard, checkpoint and date, paged,
 * and downloadable as CSV. Each row opens the scan's page (ScanDetail, "View report"); the Flags
 * column shows the same reasons as Today's Needs review. Phones get one line per scan: time,
 * checkpoint over guard, and a flag (or the location) on the right (index.css, "Log Database").
 * Also exports LoadError, the "couldn't load" message the other supervisor screens reuse.
 *
 * TODO: the design's search box ("Search checkpoint or guard") and "Any flag" filter, and one
 * filter bar shared with the Map tab (guard, checkpoint, date or date range, location status).
 * Search has to run on the server (e.g. ilike on scan_rows, or a full-text index) so it works
 * with paging and the CSV export; so does a flag filter. See README > Status and TODO.
 */
import { useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatShortDate, formatTime, localDateKey } from "../../lib/format";
import { needsReview } from "../../lib/today";
import { scansToCsv } from "../../lib/csv";
import { saveFile } from "../../lib/download";
import { Pagination } from "../../components/Pagination";
import { LocationBadge } from "../../components/LocationBadge";
import { ReasonChip } from "../../components/ReasonChip";
import { ICON } from "../../components/IconButton";
import { Download, RotateCcw, X } from "lucide-preact";

const PAGE_SIZE = 12;

interface Filters {
	guardId: string;
	checkpointId: string;
	date: string;
}

const NO_FILTERS: Filters = { guardId: "", checkpointId: "", date: "" };

export function LogDatabase() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [page, setPage] = useState(1);
	const [saved, setSaved] = useState(false);

	const options = useAsync(
		() => Promise.all([api.listGuards(), api.allCheckpoints()]),
		[],
	);
	const query = { ...clean(filters), page, pageSize: PAGE_SIZE };
	const scans = useAsync(() => api.listScans(query), [JSON.stringify(query)]);
	const filtered = Boolean(
		filters.guardId || filters.checkpointId || filters.date,
	);

	// Each scan's flags, as on Today. "Too fast" is left out: it compares a scan with the guard's
	// previous one, which may be on another page.
	const rows = scans.data?.rows ?? [];
	const flags = new Map(
		needsReview(rows).map((i) => [
			i.scan.id,
			i.flags.filter((f) => f.reason !== "reasonTooFast"),
		]),
	);

	function update(patch: Partial<Filters>) {
		setFilters((f) => ({ ...f, ...patch }));
		setPage(1); // a new filter always starts from the first page
		setSaved(false);
	}

	async function download() {
		const all = await api.exportScans(clean(filters));
		saveFile(
			`patroli-${filters.date || "semua"}.csv`,
			scansToCsv(all),
			"text/csv",
		);
		setSaved(true);
	}

	return (
		<section
			class="log-page"
			aria-labelledby="log-h">
			<header class="log-head">
				<div class="min-w-0">
					<h1
						id="log-h"
						class="dash-title">
						{t("navLogDatabase")}
					</h1>
					<p class="text-muted">{t("logIntro")}</p>
				</div>
				<div class="log-export">
					{saved && (
						<span
							class="text-muted"
							role="status">
							{t("downloaded")}
						</span>
					)}
					<button
						type="button"
						class="btn btn-primary"
						onClick={() => void download()}>
						<Download
							size={ICON}
							aria-hidden="true"
						/>
						{t("downloadCsv")}
					</button>
				</div>
			</header>

			<div class="log-filters">
				<select
					class={`field filter-chip ${filters.guardId ? "is-set" : ""}`}
					aria-label={t("guard")}
					value={filters.guardId}
					onChange={(e) =>
						update({ guardId: e.currentTarget.value })
					}>
					<option value="">{t("allGuards")}</option>
					{options.data?.[0].map((g) => (
						<option
							key={g.id}
							value={g.id}>
							{g.name}
						</option>
					))}
				</select>
				<select
					class={`field filter-chip ${filters.checkpointId ? "is-set" : ""}`}
					aria-label={t("checkpoint")}
					value={filters.checkpointId}
					onChange={(e) =>
						update({ checkpointId: e.currentTarget.value })
					}>
					<option value="">{t("allCheckpoints")}</option>
					{options.data?.[1].map((c) => (
						<option
							key={c.id}
							value={c.id}>
							{c.name}
						</option>
					))}
				</select>
				{/* Phone browsers show nothing in an empty date field, so touch screens get the
				    format here (index.css, .date-chip-hint). */}
				<span class={`date-chip ${filters.date ? "" : "is-empty"}`}>
					<input
						type="date"
						class={`field filter-chip ${filters.date ? "is-set" : ""}`}
						aria-label={t("date")}
						value={filters.date}
						max={today}
						onInput={(e) => update({ date: e.currentTarget.value })}
					/>
					{!filters.date && (
						<span
							class="date-chip-hint"
							aria-hidden="true">
							{t("datePlaceholder")}
						</span>
					)}
				</span>
				{filtered && (
					<button
						type="button"
						class="link-btn log-clear"
						onClick={() => update(NO_FILTERS)}>
						<X
							size={ICON}
							aria-hidden="true"
						/>
						{t("clearFilters")}
					</button>
				)}
			</div>

			{scans.error && <LoadError onRetry={scans.reload} />}
			{scans.data && (
				<div class={`log-card ${scans.loading ? "is-busy" : ""}`}>
					{scans.data.total === 0 ? (
						<p class="dash-empty">{t("noResults")}</p>
					) : (
						<table class="dash-table log-scans">
							<thead>
								<tr>
									<th scope="col">{t("time")}</th>
									<th
										scope="col"
										class="hidden sm:table-cell">
										{t("date")}
									</th>
									<th scope="col">{t("checkpoint")}</th>
									{/* Guard and location fold into the row on narrow screens. */}
									<th
										scope="col"
										class="hidden sm:table-cell">
										{t("guard")}
									</th>
									<th
										scope="col"
										class="hidden md:table-cell">
										{t("colLocation")}
									</th>
									<th scope="col">{t("colFlags")}</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const f = flags.get(r.id) ?? [];
									return (
										<tr
											key={r.id}
											class="has-link">
											<td class="tabular-nums font-bold whitespace-nowrap">
												{formatTime(r.scannedAt, lang)}
												<span class="dash-sub font-normal sm:hidden">
													{formatShortDate(
														r.scannedAt,
														lang,
													)}
												</span>
											</td>
											<td class="hidden sm:table-cell text-muted whitespace-nowrap">
												{formatShortDate(
													r.scannedAt,
													lang,
												)}
											</td>
											<td>
												{/* The link covers the whole row (index.css, .row-link). */}
												<Link
													href={`/supervisor/scans/${r.id}`}
													class="row-link dash-name">
													{r.checkpointName}
												</Link>
												<span class="dash-sub sm:hidden">
													{r.guardName}
												</span>
											</td>
											<td class="hidden sm:table-cell">
												{r.guardName}
											</td>
											<td class="hidden md:table-cell whitespace-nowrap">
												<LocationBadge scan={r} />
											</td>
											<td class="c-end">
												{f.length > 0 ? (
													<span class="log-chips">
														{f.map((x) => (
															<ReasonChip
																key={x.reason}
																reason={
																	x.reason
																}
															/>
														))}
													</span>
												) : (
													// No flags: narrow screens show the location here instead.
													<span class="md:hidden">
														<LocationBadge
															scan={r}
														/>
													</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
					<div class="log-card-foot">
						<Pagination
							page={page}
							pageSize={PAGE_SIZE}
							total={scans.data.total}
							onPage={setPage}
							busy={scans.loading}
						/>
					</div>
				</div>
			)}
			{!scans.data && scans.loading && (
				<p class="text-muted">{t("loading")}</p>
			)}
		</section>
	);
}

/** Drop empty filters so the query only contains what the supervisor actually chose. */
function clean(f: Filters) {
	return {
		guardId: f.guardId || undefined,
		checkpointId: f.checkpointId || undefined,
		date: f.date || undefined,
	};
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
	const { t } = useApp();
	return (
		<div
			class="notice notice-warn flex items-center justify-between gap-3"
			role="alert">
			<p>{t("loadError")}</p>
			<button
				type="button"
				class="link-btn"
				onClick={onRetry}>
				<RotateCcw
					size={ICON}
					aria-hidden="true"
				/>
				{t("retry")}
			</button>
		</div>
	);
}
