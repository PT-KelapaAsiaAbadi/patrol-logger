/**
 * The phone's GPS position, kept fresh while the scan screen is open, so a position is usually
 * ready by the time the camera reads the sticker. Works offline: GPS needs no signal.
 */
import type { ScanLocation } from "../types";

export type LocationState =
	| { kind: "finding" }
	| { kind: "found"; accuracyM: number }
	| { kind: "off" } // the guard (or the browser) refused permission
	| { kind: "unavailable" }; // no GPS, or no fix yet

/** Older than this and the position doesn't describe where the scan happened. */
const FRESH_MS = 60_000;

export interface LocationWatch {
	/** The latest position if it's fresh enough to attach to a scan. */
	latest(): ScanLocation | undefined;
	stop(): void;
}

export function watchLocation(
	onState: (state: LocationState) => void,
): LocationWatch {
	if (!("geolocation" in navigator) || !window.isSecureContext) {
		onState({ kind: "unavailable" });
		return { latest: () => undefined, stop: () => {} };
	}

	let fix: (ScanLocation & { at: number }) | undefined;
	onState({ kind: "finding" });
	const id = navigator.geolocation.watchPosition(
		(p) => {
			fix = {
				lat: p.coords.latitude,
				lng: p.coords.longitude,
				accuracyM: Math.round(p.coords.accuracy),
				at: p.timestamp,
			};
			onState({ kind: "found", accuracyM: fix.accuracyM });
		},
		(e) => {
			if (e.code === e.PERMISSION_DENIED) onState({ kind: "off" });
			else if (!fix) onState({ kind: "unavailable" }); // keep showing the last fix otherwise
		},
		{ enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
	);

	return {
		latest: () =>
			fix && Date.now() - fix.at < FRESH_MS
				? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM }
				: undefined,
		stop: () => navigator.geolocation.clearWatch(id),
	};
}
