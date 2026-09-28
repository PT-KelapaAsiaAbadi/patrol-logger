/**
 * Light, dark, or follow the device ("system"). The choice is remembered on this device and applied
 * as <html data-theme="light|dark">; "system" removes the attribute so index.css follows the
 * device's prefers-color-scheme setting.
 */
export type ThemeChoice = "system" | "light" | "dark";

const KEY = "patrol-theme";

/** The saved choice, or "system" when nothing (or nothing readable) is saved. */
export function savedTheme(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		if (v === "light" || v === "dark") return v;
	} catch {
		/* storage blocked: follow the device */
	}
	return "system";
}

/** Shows the page in the chosen theme. Called at start-up (main.tsx) and when the choice changes. */
export function applyTheme(choice: ThemeChoice): void {
	const root = document.documentElement;
	if (choice === "system") delete root.dataset.theme;
	else root.dataset.theme = choice;
}

/** Applies and remembers a choice. */
export function setTheme(choice: ThemeChoice): void {
	applyTheme(choice);
	try {
		if (choice === "system") localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, choice);
	} catch {
		/* not remembered, but still applied for now */
	}
}
