/**
 * The phone's position, kept fresh while the scan screen is open, so a position is usually
 * ready by the time the camera reads the sticker. Works offline: GPS needs no signal.
 *
 * Two sources at once: a quick rough fix from Wi-Fi and cell towers (works indoors, usually within
 * a few seconds) and a continuous precise GPS watch. The better recent one is used.
 */
import type { ScanLocation } from "../types";

export type LocationState =
	| { kind: "finding" }
	| { kind: "found"; accuracyM: number }
	| { kind: "slow" } // still trying: indoors, GPS can take a while
	| { kind: "off" } // the guard (or the browser) refused permission
	| { kind: "device_off" } // the device can't locate itself (location turned off, or no GPS)
	| { kind: "insecure" }; // not on https: browsers only give a position to secure pages

/** Older than this and the position doesn't describe where the scan happened. */
const FRESH_MS = 60_000;

export interface LocationWatch {
	/** The latest position if it's fresh enough to attach to a scan. */
	latest(): ScanLocation | undefined;
	/** Starts over, e.g. after the guard turned location on. */
	retry(): void;
	stop(): void;
}

export function watchLocation(
	onState: (state: LocationState) => void,
): LocationWatch {
	if (!window.isSecureContext) {
		onState({ kind: "insecure" });
		return { latest: () => undefined, retry: () => {}, stop: () => {} };
	}
	if (!("geolocation" in navigator)) {
		onState({ kind: "device_off" });
		return { latest: () => undefined, retry: () => {}, stop: () => {} };
	}
	const geo = navigator.geolocation;
	let fix: (ScanLocation & { at: number }) | undefined;
	let watchId: number | null = null;
	let stopped = false;

	function accept(p: GeolocationPosition) {
		if (stopped) return; // a late answer after the screen closed
		const next = {
			lat: p.coords.latitude,
			lng: p.coords.longitude,
			accuracyM: Math.round(p.coords.accuracy),
			at: p.timestamp,
		};
		// A precise fix beats a rough one of about the same age; a much newer one wins regardless.
		if (
			!fix ||
			next.at - fix.at > 30_000 ||
			next.accuracyM <= fix.accuracyM
		)
			fix = next;
		onState({ kind: "found", accuracyM: fix.accuracyM });
	}

	function fail(e: GeolocationPositionError) {
		if (stopped) return;
		if (e.code === e.PERMISSION_DENIED) onState({ kind: "off" });
		else if (fix)
			return; // keep showing the fix we have
		else if (e.code === e.POSITION_UNAVAILABLE)
			onState({ kind: "device_off" });
		else onState({ kind: "slow" }); // TIMEOUT: keep going
	}

	function start() {
		if (watchId !== null) geo.clearWatch(watchId);
		onState(
			fix
				? { kind: "found", accuracyM: fix.accuracyM }
				: { kind: "finding" },
		);
		geo.getCurrentPosition(accept, fail, {
			enableHighAccuracy: false,
			maximumAge: 60_000,
			timeout: 10_000,
		});
		// A watch keeps going after a timeout (it reports TIMEOUT, then later fixes), so it's
		// never restarted automatically: that would throw away a fix about to arrive.
		watchId = geo.watchPosition(accept, fail, {
			enableHighAccuracy: true,
			maximumAge: 15_000,
			timeout: 20_000,
		});
	}

	start();
	return {
		latest: () =>
			fix && Date.now() - fix.at < FRESH_MS
				? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM }
				: undefined,
		retry: start,
		stop: () => {
			stopped = true;
			if (watchId !== null) geo.clearWatch(watchId);
		},
	};
}
