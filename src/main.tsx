/**
 * Start-up: loads the offline outbox from the phone's storage, then starts background sending,
 * update checks and tooltips, and draws the app.
 */
import { render } from "preact";
import "./index.css";
import { AppProvider } from "./state";
import { App } from "./app";
import { loadOutbox, startAutoSync } from "./data/api";
import { startUpdates } from "./lib/updates";
import { startTooltips } from "./lib/tooltip";

// The outbox must be in memory before any screen reads it or the sync starts sending it.
void loadOutbox().then(() => {
	startAutoSync();
	startUpdates();
	startTooltips();
	render(
		<AppProvider>
			<App />
		</AppProvider>,
		document.getElementById("app")!,
	);
});
