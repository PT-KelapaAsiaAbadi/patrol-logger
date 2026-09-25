/**
 * App updates. A new version downloads in the background and waits. It's switched in (one page
 * reload) only on a screen where reloading loses nothing, and only after the offline queue has
 * saved. Switching in mid-scan would leave the open page asking for files the update deleted.
 */
import { registerSW } from "virtual:pwa-register";
import { outboxSaved } from "../data/queue";

// The guard's round, the supervisor log, and sign-in: no half-typed input to lose.
const SAFE_SCREENS = new Set(["", "#", "#/", "#/login", "#/supervisor"]);

let waiting = false;
let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;

async function applyIfSafe() {
	if (!waiting || !applyUpdate || !SAFE_SCREENS.has(location.hash)) return;
	waiting = false;
	await outboxSaved();
	await applyUpdate(true);
}

export function startUpdates() {
	applyUpdate = registerSW({
		immediate: true,
		onNeedRefresh() {
			waiting = true;
			void applyIfSafe();
		},
	});
	window.addEventListener("hashchange", () => void applyIfSafe());
}
