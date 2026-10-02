/**
 * One scan in full, for supervisors (the "View report" page, opened from Today, the Log and the
 * Map): the checkpoint and the location check up top, then two cards: the scan (guard, scan and
 * received times, map links) and the guard's report note and photos. Side by side on desktop,
 * stacked on phones (index.css, "Scan detail").
 */
import { useLocation } from "wouter-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatDateTime, formatDistance } from "../../lib/format";
import { initials } from "../../lib/personName";
import { LoadError } from "./Log";
import { mapLink } from "../../components/LocationBadge";
import { ICON } from "../../components/IconButton";
import { ArrowLeft, Clock, MapPin, MapPinOff } from "lucide-preact";
import type { ScanRow } from "../../types";

/** Received this many minutes after scanning: worth a mention (probably sent from offline). */
const DELAY_NOTE_MIN = 5;

export function ScanDetail({ id }: { id: string }) {
	const { t, lang } = useApp();
	const [, navigate] = useLocation();
	const scan = useAsync(() => api.getScan(id), [id]);
	const s = scan.data;
	const delayMin = s
		? Math.round(
				(Date.parse(s.receivedAt) - Date.parse(s.scannedAt)) / 60_000,
			)
		: 0;

	// Back to wherever the scan was opened from (Today, the Log or the Map); Today when the page
	// was opened directly.
	function back() {
		if (history.length > 1) history.back();
		else navigate("/supervisor");
	}

	return (
		<article class="scan-page">
			<button
				type="button"
				class="link-btn back-link"
				onClick={back}>
				<ArrowLeft
					size={ICON}
					aria-hidden="true"
				/>
				{t("back")}
			</button>
			{scan.error && <LoadError onRetry={scan.reload} />}
			{scan.loading && <p class="text-muted">{t("loading")}</p>}
			{!scan.loading && !scan.error && !s && <p>{t("notFound")}</p>}
			{s && (
				<>
					<header class="scan-page-head">
						<h1 class="dash-title">{s.checkpointName}</h1>
						<p class="text-muted tabular-nums">
							{s.guardName} · {formatDateTime(s.scannedAt, lang)}
						</p>
						<div class="scan-page-pills">
							<LocationPill scan={s} />
							{delayMin >= DELAY_NOTE_MIN && (
								<span class="loc-pill is-queued">
									<Clock
										size={16}
										aria-hidden="true"
									/>
									{t("sentLater", { min: delayMin })}
								</span>
							)}
						</div>
					</header>

					<div class="scan-page-grid">
						<section
							class="scan-card"
							aria-labelledby="scan-card-h">
							<h2 id="scan-card-h">{t("colScan")}</h2>
							<dl class="detail-list">
								<dt>{t("guard")}</dt>
								<dd class="scan-guard">
									<span
										class="guard-avatar"
										aria-hidden="true">
										{initials(s.guardName)}
									</span>
									{s.guardName}
								</dd>
								<dt>{t("time")}</dt>
								<dd class="tabular-nums">
									{formatDateTime(s.scannedAt, lang)}
								</dd>
								<dt>{t("receivedAt")}</dt>
								<dd class="tabular-nums">
									{formatDateTime(s.receivedAt, lang)}
									{delayMin >= DELAY_NOTE_MIN && (
										<span class="dash-sub">
											{t("delayNote", { min: delayMin })}
										</span>
									)}
								</dd>
								<dt>{t("colLocation")}</dt>
								<dd>
									{s.location && s.distanceM !== null
										? t("locDetail", {
												d: formatDistance(
													s.distanceM,
													lang,
												),
												a: Math.round(
													s.location.accuracyM,
												),
											})
										: t(`locStatus_${s.locationStatus}`)}
								</dd>
							</dl>
							{(s.location || s.checkpointLocation) && (
								<div class="scan-map-links">
									{s.location && (
										<a
											class="btn btn-outline"
											href={mapLink(
												s.location.lat,
												s.location.lng,
											)}
											target="_blank"
											rel="noopener noreferrer">
											<MapPin
												size={ICON}
												aria-hidden="true"
											/>
											{t("openScanInMap")}
										</a>
									)}
									{s.checkpointLocation && (
										<a
											class="btn btn-outline"
											href={mapLink(
												s.checkpointLocation.lat,
												s.checkpointLocation.lng,
											)}
											target="_blank"
											rel="noopener noreferrer">
											<MapPin
												size={ICON}
												aria-hidden="true"
											/>
											{t("openCheckpointInMap")}
										</a>
									)}
								</div>
							)}
						</section>

						<section
							class={`scan-card ${s.report ? "has-report" : ""}`}
							aria-labelledby="report-card-h">
							<h2 id="report-card-h">{t("report")}</h2>
							{s.report ? (
								<>
									{s.report.note && (
										<p class="scan-note">{s.report.note}</p>
									)}
									{s.report.photos.length > 0 && (
										<ul class="report-photos">
											{s.report.photos.map((src, i) => (
												<li key={i}>
													{/* Opens the full photo in a new tab. */}
													<a
														href={src}
														target="_blank"
														rel="noopener noreferrer"
														aria-label={t(
															"openPhoto",
															{ n: i + 1 },
														)}>
														<img
															src={src}
															alt=""
														/>
													</a>
												</li>
											))}
										</ul>
									)}
								</>
							) : (
								<p class="text-muted">{t("noReport")}</p>
							)}
						</section>
					</div>
				</>
			)}
		</article>
	);
}

/** The location check as a pill: green at the checkpoint, amber when far, grey otherwise. */
function LocationPill({ scan: s }: { scan: ScanRow }) {
	const { t, lang } = useApp();
	const tone =
		s.locationStatus === "ok"
			? "is-ok"
			: s.locationStatus === "far"
				? "is-warn"
				: "is-pending";
	return (
		<span class={`loc-pill ${tone}`}>
			{s.locationStatus === "ok" || s.locationStatus === "far" ? (
				<MapPin
					size={16}
					aria-hidden="true"
				/>
			) : (
				<MapPinOff
					size={16}
					aria-hidden="true"
				/>
			)}
			{s.locationStatus === "far"
				? t("locStatus_far", {
						d: formatDistance(s.distanceM ?? 0, lang),
					})
				: t(`locStatus_${s.locationStatus}`)}
		</span>
	);
}
