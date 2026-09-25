import { useEffect, useRef, useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { formatDistance, formatTime, localDateKey } from "../../lib/format";
import type { OverviewItem, OverviewMap } from "../../lib/map";
import type { Key } from "../../i18n";
import type { Checkpoint, ScanRow } from "../../types";
import { LoadError } from "./Log";

/** Popups are built as DOM with textContent, so names typed by people can't inject HTML. */
function popup(lines: (string | { text: string; href: string })[]) {
	const box = document.createElement("div");
	box.className = "map-popup";
	lines.forEach((line, i) => {
		const el =
			typeof line === "string"
				? document.createElement(i === 0 ? "strong" : "p")
				: Object.assign(document.createElement("a"), {
						href: line.href,
						className: "link",
					});
		el.textContent = typeof line === "string" ? line : line.text;
		box.append(el);
	});
	return box;
}

/**
 * One day on a map: checkpoints (green when visited that day), each scan at the position the
 * phone reported (orange and joined to its checkpoint when far), and one guard's route.
 */
export function MapView() {
	const { t, lang } = useApp();
	const today = localDateKey();
	const [date, setDate] = useState(today);
	const [guardId, setGuardId] = useState("");
	const reframe = useRef(true);

	const guards = useAsync(() => api.listGuards(), []);
	const data = useAsync(
		() =>
			Promise.all([
				api.allCheckpoints(),
				api.exportScans({ date, guardId: guardId || undefined }),
			]),
		[date, guardId],
	);

	const mapEl = useRef<HTMLDivElement>(null);
	const mapRef = useRef<OverviewMap | null>(null);
	const [mapReady, setMapReady] = useState(false);
	useEffect(() => {
		let map: OverviewMap | null = null;
		let gone = false;
		void import("../../lib/map").then(({ createOverviewMap }) => {
			if (gone || !mapEl.current) return;
			map = createOverviewMap(mapEl.current);
			mapRef.current = map;
			setMapReady(true);
		});
		return () => {
			gone = true;
			map?.destroy();
		};
	}, []);

	const [checkpoints, scans] = data.data ?? [[], []];
	const pinned = checkpoints.filter((c) => c.active && c.location);
	const unpinned = checkpoints.filter((c) => c.active && !c.location).length;
	const located = scans.filter((s) => s.location);
	const noGps = scans.length - located.length;

	useEffect(() => {
		if (!mapReady || !mapRef.current || !data.data) return;
		mapRef.current.show(
			[...pinned.map(checkpointItem), ...located.map(scanItem)],
			// A route only makes sense for one guard: their scans, earliest first.
			guardId
				? located
						.slice()
						// oxlint-disable-next-line unicorn/no-array-sort -- sorts a copy; toSorted() needs newer browsers than the app targets
						.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
						.map((s) => [s.location!.lat, s.location!.lng])
				: [],
			reframe.current,
		);
		reframe.current = false;
	}, [mapReady, data.data, lang]); // eslint-disable-line react-hooks/exhaustive-deps

	function checkpointItem(c: Checkpoint): OverviewItem {
		const visits = scans.filter((s) => s.checkpointId === c.id);
		const last = visits.reduce<string | null>(
			(latest, s) =>
				!latest || s.scannedAt > latest ? s.scannedAt : latest,
			null,
		);
		return {
			kind: "checkpoint",
			lat: c.location!.lat,
			lng: c.location!.lng,
			radiusM: c.location!.radiusM,
			visited: visits.length > 0,
			name: c.name,
			popup: () =>
				popup([
					c.name,
					t("routeOrder", { n: c.routeOrder }),
					last
						? t("popupVisited", {
								n: visits.length,
								time: formatTime(last, lang),
							})
						: t("popupNotVisited"),
				]),
		};
	}

	function scanItem(s: ScanRow): OverviewItem {
		const far = s.locationStatus === "far";
		return {
			kind: "scan",
			lat: s.location!.lat,
			lng: s.location!.lng,
			tone: far ? "far" : s.locationStatus === "ok" ? "ok" : "unknown",
			checkpoint: far ? s.checkpointLocation : null,
			popup: () =>
				popup([
					s.checkpointName,
					`${s.guardName} · ${formatTime(s.scannedAt, lang)}`,
					far
						? t("locStatus_far", {
								d: formatDistance(s.distanceM ?? 0, lang),
							})
						: t(`locStatus_${s.locationStatus}` as Key, {}),
					t("accuracy", { a: Math.round(s.location!.accuracyM) }),
					{
						text: t("viewDetails"),
						href: `#/supervisor/scans/${s.id}`,
					},
				]),
		};
	}

	return (
		<>
			<h1 class="text-xl font-bold mb-3">{t("navMap")}</h1>

			<div class="filters map-filters">
				<label>
					<span>{t("date")}</span>
					<input
						type="date"
						class="field"
						required
						value={date}
						max={today}
						onInput={(e) => {
							if (!e.currentTarget.value) return;
							reframe.current = true;
							setDate(e.currentTarget.value);
						}}
					/>
				</label>
				<label>
					<span>{t("guard")}</span>
					<select
						class="field"
						value={guardId}
						onChange={(e) => {
							reframe.current = true;
							setGuardId(e.currentTarget.value);
						}}>
						<option value="">{t("all")}</option>
						{guards.data?.map((g) => (
							<option
								key={g.id}
								value={g.id}>
								{g.name}
							</option>
						))}
					</select>
				</label>
				<div class="flex items-end">
					<button
						type="button"
						class="btn btn-quiet"
						disabled={data.loading}
						onClick={data.reload}>
						{data.loading ? t("loading") : t("refresh")}
					</button>
				</div>
			</div>

			{data.error && <LoadError onRetry={data.reload} />}

			<div
				ref={mapEl}
				class="overview-map"
				role="region"
				aria-label={t("navMap")}
			/>

			{data.data && (
				<div class="mt-3 grid gap-1 text-sm">
					{pinned.length === 0 && located.length === 0 ? (
						<p class="text-muted">{t("mapNoData")}</p>
					) : (
						<p>{t("mapScansShown", { n: located.length })}</p>
					)}
					{noGps > 0 && (
						<p class="text-muted">
							{t("mapScansNoGps", { n: noGps })}
						</p>
					)}
					{unpinned > 0 && (
						<p class="text-muted">
							{t("mapUnpinned", { n: unpinned })}{" "}
							<Link
								href="/supervisor/checkpoints"
								class="link">
								{t("navCheckpoints")}
							</Link>
						</p>
					)}
				</div>
			)}

			<ul class="map-legend mt-4">
				<li>
					<span class="legend-pin" />
					{t("legendPending")}
				</li>
				<li>
					<span class="legend-pin is-visited" />
					{t("legendVisited")}
				</li>
				<li>
					<span class="legend-dot" />
					{t("legendScanOk")}
				</li>
				<li>
					<span class="legend-dot is-far" />
					{t("legendScanFar")}
				</li>
				<li>
					<span class="legend-dot is-unknown" />
					{t("legendScanUnknown")}
				</li>
				<li>
					<span class="legend-line" />
					{t("legendRoute")}
				</li>
			</ul>
		</>
	);
}
