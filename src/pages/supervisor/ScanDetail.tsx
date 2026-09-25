import { Link } from "wouter-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatDateTime, formatDistance } from "../../lib/format";
import { LoadError } from "./Log";
import { LocationBadge, mapLink } from "../../components/LocationBadge";

export function ScanDetail({ id }: { id: string }) {
	const { t, lang } = useApp();
	const scan = useAsync(() => api.getScan(id), [id]);
	const s = scan.data;
	const delayMin = s
		? Math.round(
				(Date.parse(s.receivedAt) - Date.parse(s.scannedAt)) / 60_000,
			)
		: 0;

	return (
		<article class="max-w-2xl">
			<Link
				href="/supervisor"
				class="link-btn">
				{t("back")}
			</Link>
			{scan.error && (
				<div class="mt-4">
					<LoadError onRetry={scan.reload} />
				</div>
			)}
			{scan.loading && <p class="mt-4 text-muted">{t("loading")}</p>}
			{!scan.loading && !scan.error && !s && (
				<p class="mt-4">{t("notFound")}</p>
			)}
			{s && (
				<>
					<h1 class="text-2xl font-bold mt-3">{s.checkpointName}</h1>
					<dl class="detail-list mt-4">
						<dt>{t("guard")}</dt>
						<dd>{s.guardName}</dd>
						<dt>{t("time")}</dt>
						<dd class="tabular-nums">
							{formatDateTime(s.scannedAt, lang)}
						</dd>
						<dt>{t("receivedAt")}</dt>
						<dd class="tabular-nums">
							{formatDateTime(s.receivedAt, lang)}
						</dd>
						<dt>{t("colLocation")}</dt>
						<dd>
							<LocationBadge scan={s} />
							{s.location && (
								<>
									{s.distanceM !== null && (
										<span class="text-muted">
											{" "}
											{t("locDetail", {
												d: formatDistance(
													s.distanceM,
													lang,
												),
												a: Math.round(
													s.location.accuracyM,
												),
											})}
										</span>
									)}{" "}
									<a
										class="link"
										href={mapLink(
											s.location.lat,
											s.location.lng,
										)}
										target="_blank"
										rel="noopener noreferrer">
										{t("openScanInMap")}
									</a>
								</>
							)}
							{s.checkpointLocation && (
								<>
									{" · "}
									<a
										class="link"
										href={mapLink(
											s.checkpointLocation.lat,
											s.checkpointLocation.lng,
										)}
										target="_blank"
										rel="noopener noreferrer">
										{t("openCheckpointInMap")}
									</a>
								</>
							)}
						</dd>
					</dl>
					{delayMin >= 5 && (
						<p class="text-muted mt-2">
							{t("delayNote", { min: delayMin })}
						</p>
					)}

					<h2 class="text-lg font-semibold mt-8 mb-2">
						{t("report")}
					</h2>
					{s.report ? (
						<>
							<p class="whitespace-pre-wrap max-w-prose">
								{s.report.note}
							</p>
							{s.report.photos.length > 0 && (
								<ul class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
									{s.report.photos.map((src, i) => (
										<li key={i}>
											<img
												src={src}
												alt=""
												class="w-full border border-line"
											/>
										</li>
									))}
								</ul>
							)}
						</>
					) : (
						<p class="text-muted">{t("noReport")}</p>
					)}
				</>
			)}
		</article>
	);
}
