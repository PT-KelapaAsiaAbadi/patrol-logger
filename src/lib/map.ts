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
