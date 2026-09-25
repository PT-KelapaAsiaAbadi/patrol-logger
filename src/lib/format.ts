import type { Lang } from "../i18n";

const locale = (lang: Lang) => (lang === "id" ? "id-ID" : "en-AU");

/** YYYY-MM-DD in the phone's local time zone (WIB/WITA/WIT for guards in Indonesia). */
export function localDateKey(iso: string | Date = new Date()): string {
	const d = typeof iso === "string" ? new Date(iso) : iso;
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatter = (lang: Lang, withDate: boolean) => {
	const key = `${lang}:${withDate}`;
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(locale(lang), {
			...(withDate && { day: "numeric", month: "short" }),
			hour: "2-digit",
			minute: "2-digit",
		});
		formatters.set(key, f);
	}
	return f;
};

/** Indonesian formatting writes 17.40; a colon (17:40) is what people here read as a time. */
const withColon = (f: Intl.DateTimeFormat, iso: string) =>
	f
		.formatToParts(new Date(iso))
		.map((p, i, all) =>
			p.type === "literal" &&
			all[i - 1]?.type === "hour" &&
			all[i + 1]?.type === "minute"
				? ":"
				: p.value,
		)
		.join("");

export const formatTime = (iso: string, lang: Lang) =>
	withColon(formatter(lang, false), iso);

export const formatDateTime = (iso: string, lang: Lang) =>
	withColon(formatter(lang, true), iso);

/** "85 m" up to a kilometre, then "5.6 km". */
export const formatDistance = (metres: number, lang: Lang) =>
	metres < 1000
		? `${Math.round(metres)} m`
		: `${(metres / 1000).toLocaleString(locale(lang), { maximumFractionDigits: 1 })} km`;

export const formatLongDate = (key: string, lang: Lang) =>
	new Date(`${key}T12:00:00`).toLocaleDateString(locale(lang), {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
