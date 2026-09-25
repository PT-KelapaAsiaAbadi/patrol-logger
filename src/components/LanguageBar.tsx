import { useApp } from "../state";

/** Bahasa Indonesia / English switch, shown above every page. */
export function LanguageBar() {
	const { lang, setLang } = useApp();

	return (
		<div class="lang-bar">
			<span
				class="ml-auto inline-flex"
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
