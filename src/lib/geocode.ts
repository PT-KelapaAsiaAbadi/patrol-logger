/**
 * Address search and "what's at this point", from OpenStreetMap's Nominatim service. Free and
 * keyless; its usage policy allows light use like this (a supervisor setting up checkpoints) but
 * not search-as-you-type, so searches only run when the supervisor presses Search.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface Place {
	label: string;
	lat: number;
	lng: number;
}

/** Up to 5 places matching an address or place name. */
export async function searchAddress(
	query: string,
	lang: string,
	signal?: AbortSignal,
): Promise<Place[]> {
	const url = `${NOMINATIM}/search?format=jsonv2&limit=5&accept-language=${lang}&q=${encodeURIComponent(query)}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`geocode_${res.status}`);
	const rows = (await res.json()) as {
		display_name: string;
		lat: string;
		lon: string;
	}[];
	return rows.map((r) => ({
		label: r.display_name,
		lat: Number(r.lat),
		lng: Number(r.lon),
	}));
}

/** The nearest address to a point, or null if there isn't one (open sea, say). */
export async function addressAt(
	lat: number,
	lng: number,
	lang: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=18&accept-language=${lang}&lat=${lat}&lon=${lng}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`geocode_${res.status}`);
	const row = (await res.json()) as { display_name?: string };
	return row.display_name ?? null;
}

/** Reads "lat, lng" as pasted from Google Maps or similar. */
export function parseCoordinates(
	text: string,
): { lat: number; lng: number } | null {
	const m = text
		.trim()
		.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
	if (!m) return null;
	const lat = Number(m[1]);
	const lng = Number(m[2]);
	return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
