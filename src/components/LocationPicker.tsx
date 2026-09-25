import { useEffect, useRef, useState } from "preact/hooks";
import { useApp } from "../state";
import {
	addressAt,
	parseCoordinates,
	searchAddress,
	type Place,
} from "../lib/geocode";
import type { PickerMap } from "../lib/map";
import type { CheckpointLocation } from "../types";
import { ICON, IconButton } from "../components/IconButton";
import {
	ArrowRight,
	Check,
	LocateFixed,
	Search,
	Trash2,
	X,
} from "lucide-preact";

const DEFAULT_RADIUS_M = 50;

/**
 * Dialog for pinning a checkpoint: tap or drag on the map, search an address, use the
 * supervisor's own position (handy when standing at the checkpoint), or paste coordinates.
 * `onSave(null)` removes the location.
 */
export function LocationPicker({
	name,
	initial,
	onSave,
	onClose,
}: {
	name: string;
	initial: CheckpointLocation | null;
	onSave: (location: CheckpointLocation | null) => Promise<void> | void;
	onClose: () => void;
}) {
	const { t, lang } = useApp();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const mapEl = useRef<HTMLDivElement>(null);
	const mapRef = useRef<PickerMap | null>(null);

	const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
		initial && { lat: initial.lat, lng: initial.lng },
	);
	const [radius, setRadius] = useState(initial?.radiusM ?? DEFAULT_RADIUS_M);
	const [address, setAddress] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Place[] | null>(null);
	const [searching, setSearching] = useState(false);
	const [coords, setCoords] = useState("");
	const [problem, setProblem] = useState<
		"search" | "myLocation" | "coords" | "save" | null
	>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		dialogRef.current?.showModal();
		let map: PickerMap | null = null;
		let gone = false;
		// Leaflet is only downloaded now, the first time a supervisor opens this.
		void import("../lib/map").then(({ createPickerMap }) => {
			if (gone || !mapEl.current) return;
			map = createPickerMap(mapEl.current, {
				start: point,
				radiusM: radius,
				onPick: (lat, lng) => setPoint({ lat, lng }),
			});
			mapRef.current = map;
		});
		return () => {
			gone = true;
			map?.destroy();
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Show the address at the pin, so the supervisor can tell it's the right building.
	useEffect(() => {
		setAddress(null);
		if (!point) return;
		const abort = new AbortController();
		const timer = setTimeout(() => {
			addressAt(point.lat, point.lng, lang, abort.signal)
				.then(setAddress)
				.catch(() => {});
		}, 400);
		return () => {
			clearTimeout(timer);
			abort.abort();
		};
	}, [point?.lat, point?.lng, lang]); // eslint-disable-line react-hooks/exhaustive-deps

	async function search() {
		if (!query.trim()) return;
		setSearching(true);
		setProblem(null);
		try {
			setResults(await searchAddress(query.trim(), lang));
		} catch {
			setProblem("search");
		} finally {
			setSearching(false);
		}
	}

	function useMyLocation() {
		setProblem(null);
		navigator.geolocation?.getCurrentPosition(
			(p) =>
				mapRef.current?.setPoint(p.coords.latitude, p.coords.longitude),
			() => setProblem("myLocation"),
			{ enableHighAccuracy: true, timeout: 20_000, maximumAge: 10_000 },
		);
	}

	function goToCoords() {
		const c = parseCoordinates(coords);
		if (!c) {
			setProblem("coords");
			return;
		}
		setProblem(null);
		mapRef.current?.setPoint(c.lat, c.lng);
	}

	async function save(location: CheckpointLocation | null) {
		setBusy(true);
		setProblem(null);
		try {
			await onSave(location);
			onClose();
		} catch {
			setProblem("save");
		} finally {
			setBusy(false);
		}
	}

	return (
		<dialog
			ref={dialogRef}
			class="picker"
			aria-labelledby="picker-h"
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}>
			<h2
				id="picker-h"
				class="text-lg font-semibold">
				{t("pickerTitle", { name })}
			</h2>
			<p class="text-muted text-sm mt-1">{t("pickerHint")}</p>

			<form
				class="flex gap-2 mt-3"
				onSubmit={(e) => {
					e.preventDefault();
					void search();
				}}>
				<input
					class="field flex-1"
					type="search"
					aria-label={t("searchAddress")}
					placeholder={t("searchAddress")}
					value={query}
					onInput={(e) => setQuery(e.currentTarget.value)}
				/>
				<IconButton
					icon={Search}
					type="submit"
					label={t("search")}
					tip={t("searchTip")}
					class={`icon-btn-lg ${searching ? "is-spinning" : ""}`}
					disabled={searching || !query.trim()}
				/>
			</form>
			{results &&
				(results.length === 0 ? (
					<p class="text-muted text-sm mt-2">{t("noPlaces")}</p>
				) : (
					<ul class="picker-results mt-2">
						{results.map((r) => (
							<li key={`${r.lat},${r.lng}`}>
								<button
									type="button"
									onClick={() => {
										mapRef.current?.setPoint(r.lat, r.lng);
										setResults(null);
									}}>
									{r.label}
								</button>
							</li>
						))}
					</ul>
				))}

			<div class="flex flex-wrap items-end gap-2 mt-3">
				<button
					type="button"
					class="btn btn-quiet"
					onClick={useMyLocation}>
					<LocateFixed
						size={ICON}
						aria-hidden="true"
					/>
					{t("useMyLocation")}
				</button>
				<form
					class="flex items-end gap-2 flex-1 min-w-56"
					onSubmit={(e) => {
						e.preventDefault();
						goToCoords();
					}}>
					<label class="grid gap-1 flex-1 text-sm font-medium">
						{t("coordinates")}
						<input
							class="field font-normal"
							inputMode="decimal"
							placeholder={t("coordinatesHint")}
							value={coords}
							onInput={(e) => setCoords(e.currentTarget.value)}
						/>
					</label>
					<IconButton
						icon={ArrowRight}
						type="submit"
						label={t("go")}
						tip={t("goTip")}
						class="icon-btn-lg"
						disabled={!coords.trim()}
					/>
				</form>
			</div>

			<div
				ref={mapEl}
				class="picker-map mt-3"
			/>

			<div class="mt-3 text-sm">
				{point ? (
					<>
						<p class="font-mono">
							{point.lat.toFixed(6)}, {point.lng.toFixed(6)}
						</p>
						{address && (
							<p class="text-muted">
								{t("pickedAddress", { address })}
							</p>
						)}
					</>
				) : (
					<p class="text-muted">{t("noPointYet")}</p>
				)}
			</div>

			<label class="grid gap-1 mt-3 max-w-60 text-sm font-medium">
				{t("radius")}
				<input
					class="field font-normal"
					type="number"
					min={10}
					max={1000}
					step={5}
					value={radius}
					onInput={(e) => {
						const m = Number(e.currentTarget.value);
						if (m >= 10 && m <= 1000) {
							setRadius(m);
							mapRef.current?.setRadius(m);
						}
					}}
				/>
			</label>
			<p class="text-muted text-sm mt-1">{t("radiusHint")}</p>

			{problem && (
				<p
					class="notice notice-warn mt-3"
					role="alert">
					{t(
						problem === "search"
							? "searchFailed"
							: problem === "myLocation"
								? "myLocationFailed"
								: problem === "coords"
									? "coordinatesInvalid"
									: "saveError",
					)}
				</p>
			)}

			<div class="flex flex-wrap gap-3 mt-4">
				<button
					type="button"
					class="btn btn-primary"
					disabled={busy || !point}
					onClick={() =>
						point &&
						void save({
							lat: point.lat,
							lng: point.lng,
							radiusM: radius,
						})
					}>
					<Check
						size={ICON}
						aria-hidden="true"
					/>
					{busy ? t("saving") : t("save")}
				</button>
				{initial && (
					<button
						type="button"
						class="btn btn-quiet"
						disabled={busy}
						onClick={() => void save(null)}>
						<Trash2
							size={ICON}
							aria-hidden="true"
						/>
						{t("removeLocation")}
					</button>
				)}
				<button
					type="button"
					class="btn btn-ghost"
					onClick={onClose}>
					<X
						size={ICON}
						aria-hidden="true"
					/>
					{t("cancel")}
				</button>
			</div>
		</dialog>
	);
}
