/**
 * The Log Database tab: every scan, filtered by date, guard and checkpoint, paged, and
 * downloadable as CSV. Moved here from the old start page, which is now Today (Today.tsx).
 * Also exports LoadError, the "couldn't load" message the other supervisor screens reuse.
 *
 * TODO: redesign this page (it shows a "to be updated" notice until then). Planned: one filter
 * bar shared with the Map tab (guard, checkpoint, date or date range, location status) and a
 * server-side search box (guard or checkpoint name, report text). See README > TODO.
 */
import { useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatDateTime, localDateKey } from "../../lib/format";
import { scansToCsv } from "../../lib/csv";
import { saveFile } from "../../lib/download";
import { Pagination } from "../../components/Pagination";
import { LocationBadge } from "../../components/LocationBadge";
import { ICON, IconLink } from "../../components/IconButton";
import { Download, FileText, RotateCcw, TriangleAlert } from "lucide-preact";

const PAGE_SIZE = 12;

interface Filters {
	guardId: string;
	checkpointId: string;
	date: string;
}

export function LogDatabase() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const [filters, setFilters] = useState<Filters>({
		guardId: "",
		checkpointId: "",
		date: "",
	});
	const [page, setPage] = useState(1);
	const [saved, setSaved] = useState(false);

	const options = useAsync(
		() => Promise.all([api.listGuards(), api.allCheckpoints()]),
		[],
	);
	const query = { ...clean(filters), page, pageSize: PAGE_SIZE };
	const scans = useAsync(() => api.listScans(query), [JSON.stringify(query)]);

	function update(patch: Partial<Filters>) {
		setFilters((f) => ({ ...f, ...patch }));
		setPage(1); // a new filter always starts from the first page
		setSaved(false);
	}

	async function download() {
		const rows = await api.exportScans(clean(filters));
		saveFile(
			`patroli-${filters.date || "semua"}.csv`,
			scansToCsv(rows),
			"text/csv",
		);
		setSaved(true);
	}

	return (
		<>
			<section aria-labelledby="log-h">
				<h1
					id="log-h"
					class="text-xl font-bold mb-3">
					{t("navLogDatabase")}
				</h1>
				<p
					class="notice notice-soon mb-4 flex items-start gap-2"
					role="note">
					<TriangleAlert
						size={ICON}
						class="shrink-0 mt-0.5"
						aria-hidden="true"
					/>
					{t("logDatabaseSoon")}
				</p>

				{/*
					TODO: refactor the filters into one filter bar shared with the Map tab (guard,
					checkpoint, date or date range, location status), and add a search box (guard or
					checkpoint name, report text). Search has to run on the server (e.g. ilike on
					scan_rows, or a full-text index) so it works with paging and the CSV export.
				*/}
				<div class="filters">
					<label>
						<span>{t("guard")}</span>
						<select
							class="field"
							value={filters.guardId}
							onChange={(e) =>
								update({ guardId: e.currentTarget.value })
							}>
							<option value="">{t("all")}</option>
							{options.data?.[0].map((g) => (
								<option
									key={g.id}
									value={g.id}>
									{g.name}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>{t("checkpoint")}</span>
						<select
							class="field"
							value={filters.checkpointId}
							onChange={(e) =>
								update({ checkpointId: e.currentTarget.value })
							}>
							<option value="">{t("all")}</option>
							{options.data?.[1].map((c) => (
								<option
									key={c.id}
									value={c.id}>
									{c.name}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>{t("date")}</span>
						<input
							type="date"
							class="field"
							value={filters.date}
							max={today}
							onInput={(e) =>
								update({ date: e.currentTarget.value })
							}
						/>
					</label>
					<div class="flex items-end gap-3">
						<button
							type="button"
							class="btn btn-quiet"
							onClick={() => void download()}>
							<Download
								size={ICON}
								aria-hidden="true"
							/>
							{t("downloadCsv")}
						</button>
						{saved && (
							<span
								class="text-muted"
								role="status">
								{t("downloaded")}
							</span>
						)}
					</div>
				</div>

				{scans.error && <LoadError onRetry={scans.reload} />}
				{scans.data && (
					<div
						class={
							scans.loading ? "opacity-60 transition-opacity" : ""
						}>
						{scans.data.total === 0 ? (
							<p class="py-8 text-muted">{t("noResults")}</p>
						) : (
							<div class="table-wrap">
								<table class="log-table">
									<thead>
										<tr>
											<th scope="col">{t("time")}</th>
											<th scope="col">{t("guard")}</th>
											<th scope="col">
												{t("checkpoint")}
											</th>
											<th scope="col">
												{t("colLocation")}
											</th>
											<th scope="col">{t("report")}</th>
										</tr>
									</thead>
									<tbody>
										{scans.data.rows.map((r) => (
											<tr key={r.id}>
												<td class="tabular-nums whitespace-nowrap">
													{formatDateTime(
														r.scannedAt,
														lang,
													)}
												</td>
												<td>{r.guardName}</td>
												<td>{r.checkpointName}</td>
												<td class="whitespace-nowrap">
													<LocationBadge scan={r} />
												</td>
												<td>
													{r.report ? (
														<IconLink
															icon={FileText}
															href={`/supervisor/scans/${r.id}`}
															label={t(
																"viewReport",
															)}
														/>
													) : (
														<span
															class="text-muted"
															aria-label={t(
																"noReport",
															)}>
															-
														</span>
													)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
						<Pagination
							page={page}
							pageSize={PAGE_SIZE}
							total={scans.data.total}
							onPage={setPage}
							busy={scans.loading}
						/>
					</div>
				)}
				{!scans.data && scans.loading && (
					<p class="py-8 text-muted">{t("loading")}</p>
				)}
			</section>
		</>
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
