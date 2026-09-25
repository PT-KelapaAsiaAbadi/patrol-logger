/**
 * App updates. A new version downloads in the background and waits. It's switched in (one page
 * reload) only when that can't lose anything, and only after the offline queue has saved.
 * Switching in mid-scan would leave the open page asking for files the update deleted.
 *
 * "Can't lose anything" means either:
 *   - the page was just (re)loaded and nobody has clicked or typed yet, or
 *   - it's on a screen with nothing to type into (the round, the log, the map, a scan, sign-in).
 *
 * The first matters because reloading doesn't swap in a waiting version by itself: the browser
 * keeps the old one until every tab of the app is closed.
 */
import { registerSW } from "virtual:pwa-register";
import { outboxSaved } from "../data/queue";

const SAFE_SCREENS = [
	/^#?\/?$/, // the guard's round
	/^#\/login$/,
	/^#\/supervisor$/, // patrol log
	/^#\/supervisor\/map$/,
	/^#\/supervisor\/scans\/[^/]+$/,
];

/** A tab left open (a supervisor's desk) still hears about new versions. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

let waiting = false;
let touched = false; // clicked, tapped or typed since this page loaded
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;

async function applyIfSafe() {
	if (!waiting || !applyUpdate) return;
	if (touched && !SAFE_SCREENS.some((re) => re.test(location.hash))) return;
	waiting = false;
	await outboxSaved();
	await applyUpdate(true);
}

export function startUpdates() {
	for (const type of ["pointerdown", "keydown"]) {
		window.addEventListener(type, () => (touched = true), {
			capture: true,
			once: true,
		});
	}
	applyUpdate = registerSW({
		immediate: true,
		onNeedRefresh() {
			waiting = true;
			void applyIfSafe();
		},
		onRegisteredSW(_url, registration) {
			if (registration)
				setInterval(() => void registration.update(), CHECK_EVERY_MS);
		},
	});
	window.addEventListener("hashchange", () => void applyIfSafe());
}
