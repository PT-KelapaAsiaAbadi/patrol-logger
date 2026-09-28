/**
 * The bar above every page: the theme switch (system, light, dark) and the language switch.
 * Both choices are remembered on this device (lib/theme.ts, state.tsx).
 */
import { useState } from "preact/hooks";
import { Monitor, Moon, Sun } from "lucide-preact";
import type { LucideIcon } from "lucide-preact";
import { useApp } from "../state";
import { savedTheme, setTheme, type ThemeChoice } from "../lib/theme";
import type { Key } from "../i18n";

const THEMES: { choice: ThemeChoice; icon: LucideIcon; label: Key }[] = [
	{ choice: "system", icon: Monitor, label: "themeSystem" },
	{ choice: "light", icon: Sun, label: "themeLight" },
	{ choice: "dark", icon: Moon, label: "themeDark" },
];

export function LanguageBar() {
	const { t, lang, setLang } = useApp();
	const [theme, setThemeState] = useState<ThemeChoice>(savedTheme);

	return (
		<div class="lang-bar">
			<span
				class="ml-auto inline-flex"
				role="group"
				aria-label={t("themeLabel")}>
				{THEMES.map(({ choice, icon: Icon, label }) => (
					<button
						key={choice}
						type="button"
						class="lang-btn"
						aria-pressed={theme === choice}
						aria-label={t(label)}
						data-tip={t(label)}
						onClick={() => {
							setTheme(choice);
							setThemeState(choice);
						}}>
						<Icon
							size={14}
							aria-hidden="true"
						/>
					</button>
				))}
			</span>
			<span
				class="inline-flex"
				role="group"
				aria-label="Language">
				{(["id", "en"] as const).map((l) => (
					<button
						key={l}
						type="button"
						class="lang-btn"
						aria-pressed={lang === l}
						onClick={() => setLang(l)}>
						{l.toUpperCase()}
					</button>
				))}
			</span>
		</div>
	);
}
