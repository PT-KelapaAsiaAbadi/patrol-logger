import { useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatDateTime, formatTime, localDateKey } from "../../lib/format";
import { scansToCsv } from "../../lib/csv";
import { saveFile } from "../../lib/download";
import { Pagination } from "../../components/Pagination";
import { LocationBadge } from "../../components/LocationBadge";
import { ICON, IconLink } from "../../components/IconButton";
import { Download, FileText, RotateCcw } from "lucide-preact";

const PAGE_SIZE = 12;

interface Filters {
	guardId: string;
	checkpointId: string;
	date: string;
}

export function SupervisorLog() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const [filters, setFilters] = useState<Filters>({
		guardId: "",
		checkpointId: "",
		date: "",
	});
	const [page, setPage] = useState(1);
	const [saved, setSaved] = useState(false);

	const summary = useAsync(
		() =>
			Promise.all([
				api.guardSummaries(today),
				api.missedCheckpoints(today),
			]),
		[today],
	);
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
			<section aria-labelledby="today-h">
				<h1
					id="today-h"
					class="text-xl font-bold mb-3">
					{t("onDuty")}
				</h1>
				{summary.error && <LoadError onRetry={summary.reload} />}
				{summary.data && (
					<>
						<ul class="duty-list">
							{summary.data[0].map((g) => (
								<li key={g.guardId}>
									<span class="font-medium">
										{g.guardName}
									</span>
									<span class="tabular-nums">
										{t("scansCount", { n: g.scansToday })}
									</span>
									<span class="text-muted tabular-nums">
										{g.lastScanAt
											? t("lastScan", {
													time: formatTime(
														g.lastScanAt,
														lang,
													),
												})
											: t("noScansYet")}
									</span>
								</li>
							))}
						</ul>
						<p
							class={`mt-3 ${summary.data[1].length ? "text-warn font-medium" : "text-muted"}`}>
							{summary.data[1].length
								? t("missedToday", {
										list: summary.data[1]
											.map((c) => c.name)
											.join(", "),
									})
								: t("allVisited")}
						</p>
					</>
				)}
			</section>

			<section
				class="mt-10"
				aria-labelledby="log-h">
				<h2
					id="log-h"
					class="text-xl font-bold mb-3">
					{t("navLog")}
				</h2>

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
