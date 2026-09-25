/**
 * The checkpoint map: OpenStreetMap tiles through Leaflet, one draggable pin and a circle for the
 * radius. Imported only when a supervisor opens the location picker, so guards' phones never
 * download it (the service worker skips map-* files too).
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface PickerMap {
	/** Moves the pin (and the view) to a point, as if the supervisor had tapped there. */
	setPoint(lat: number, lng: number, zoom?: number): void;
	setRadius(metres: number): void;
	destroy(): void;
}

const INDONESIA: L.LatLngTuple = [-2.5, 118];

export function createPickerMap(
	el: HTMLElement,
	opts: {
		start: { lat: number; lng: number } | null;
		radiusM: number;
		onPick: (lat: number, lng: number) => void;
	},
): PickerMap {
	const map = L.map(el);
	L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
		maxZoom: 19,
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}).addTo(map);

	const accent =
		getComputedStyle(document.documentElement)
			.getPropertyValue("--accent")
			.trim() || "#f0a500";
	// A CSS pin: Leaflet's default marker images don't survive bundling.
	const icon = L.divIcon({
		className: "map-pin",
		iconSize: [26, 26],
		iconAnchor: [13, 30],
	});
	let marker: L.Marker | null = null;
	let circle: L.Circle | null = null;
	let radius = opts.radiusM;

	function place(lat: number, lng: number) {
		if (marker && circle) {
			marker.setLatLng([lat, lng]);
			circle.setLatLng([lat, lng]);
			return;
		}
		marker = L.marker([lat, lng], { icon, draggable: true, keyboard: true })
			.addTo(map)
			.on("dragend", () => {
				const p = marker!.getLatLng();
				circle?.setLatLng(p);
				opts.onPick(p.lat, p.lng);
			});
		circle = L.circle([lat, lng], {
			radius,
			color: accent,
			weight: 2,
			fillOpacity: 0.15,
		}).addTo(map);
	}

	map.on("click", (e: L.LeafletMouseEvent) => {
		place(e.latlng.lat, e.latlng.lng);
		opts.onPick(e.latlng.lat, e.latlng.lng);
	});

	if (opts.start) {
		map.setView([opts.start.lat, opts.start.lng], 18);
		place(opts.start.lat, opts.start.lng);
	} else {
		map.setView(INDONESIA, 5);
	}
	// The map is created inside a dialog that has only just opened; measure again once laid out.
	setTimeout(() => map.invalidateSize(), 0);

	return {
		setPoint(lat, lng, zoom = 18) {
			place(lat, lng);
			map.setView([lat, lng], zoom);
			opts.onPick(lat, lng);
		},
		setRadius(metres) {
			radius = metres;
			circle?.setRadius(metres);
		},
		destroy: () => map.remove(),
	};
}

// ---------- supervisor overview ----------

export type OverviewItem =
	| {
			kind: "checkpoint";
			lat: number;
			lng: number;
			radiusM: number;
			visited: boolean;
			name: string;
			popup: () => HTMLElement;
	  }
	| {
			kind: "scan";
			lat: number;
			lng: number;
			/** ok: at its checkpoint, far: too far away, unknown: its checkpoint isn't pinned. */
			tone: "ok" | "far" | "unknown";
			/** For a far scan: where its checkpoint is, drawn as a dashed line. */
			checkpoint: { lat: number; lng: number } | null;
			popup: () => HTMLElement;
	  };

export interface OverviewMap {
	/**
	 * Replaces everything on the map. `path` joins one guard's scans in time order.
	 * `reframe` zooms to the new data; otherwise the supervisor's own zoom and pan are kept.
	 */
	show(
		items: OverviewItem[],
		path: [number, number][],
		reframe?: boolean,
	): void;
	destroy(): void;
}

const cssColor = (name: string, fallback: string) =>
	getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
	fallback;

export function createOverviewMap(el: HTMLElement): OverviewMap {
	const map = L.map(el).setView(INDONESIA, 5);
	L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
		maxZoom: 19,
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
	}).addTo(map);
	setTimeout(() => map.invalidateSize(), 0);
	const layer = L.layerGroup().addTo(map);
	let fitted = false;

	return {
		show(items, path, reframe = false) {
			layer.clearLayers();
			const ok = cssColor("--ok-fill", "#1f7a4a");
			const warn = cssColor("--warn", "#9c3a10");
			const accent = cssColor("--accent", "#f0a500");
			const muted = cssColor("--muted", "#56616d");
			const points: L.LatLngTuple[] = [];

			if (path.length > 1) {
				L.polyline(path, {
					color: accent,
					weight: 3,
					opacity: 0.8,
					className: "map-path",
				}).addTo(layer);
			}
			for (const item of items) {
				points.push([item.lat, item.lng]);
				if (item.kind === "checkpoint") {
					L.circle([item.lat, item.lng], {
						radius: item.radiusM,
						color: item.visited ? ok : accent,
						weight: 1,
						fillOpacity: 0.08,
						interactive: false,
					}).addTo(layer);
					L.marker([item.lat, item.lng], {
						icon: L.divIcon({
							className: `map-pin${item.visited ? " is-visited" : ""}`,
							iconSize: [26, 26],
							iconAnchor: [13, 30],
							popupAnchor: [0, -28],
						}),
						title: item.name,
						alt: item.name,
						keyboard: true,
					})
						.bindPopup(item.popup)
						.addTo(layer);
				} else {
					if (item.tone === "far" && item.checkpoint) {
						L.polyline(
							[
								[item.lat, item.lng],
								[item.checkpoint.lat, item.checkpoint.lng],
							],
							{
								color: warn,
								weight: 2,
								dashArray: "6 6",
								interactive: false,
							},
						).addTo(layer);
					}
					L.circleMarker([item.lat, item.lng], {
						radius: 7,
						color: "#fff",
						weight: 2,
						fillColor:
							item.tone === "far"
								? warn
								: item.tone === "ok"
									? ok
									: muted,
						fillOpacity: 1,
						className: `map-scan is-${item.tone}`,
					})
						.bindPopup(item.popup)
						.addTo(layer);
				}
			}

			if ((reframe || !fitted) && points.length) {
				fitted = true;
				if (points.length === 1) map.setView(points[0], 17);
				else map.fitBounds(points, { padding: [30, 30], maxZoom: 18 });
			}
		},
		destroy: () => map.remove(),
	};
}
