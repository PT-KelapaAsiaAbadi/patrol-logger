/**
 * Dates, times and distances the way people in Indonesia read them, in Indonesian or English
 * (17:40, "85 m", "5.6 km"), plus the local-date key that groups a day's scans.
 */
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

/** "Sen 28" / "Mon 28": a weekday and day of the month, for column headings. */
export const formatShortDay = (key: string, lang: Lang) =>
	new Date(`${key}T12:00:00`).toLocaleDateString(locale(lang), {
		weekday: "short",
		day: "numeric",
	});

/** The seven day keys (Monday first) of the week that contains `key`. */
export function weekKeys(key: string): string[] {
	const monday = new Date(`${key}T12:00:00`);
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(monday);
		d.setDate(monday.getDate() + i);
		return localDateKey(d);
	});
}

/** "Jum, 2 Okt" / "Fri, 2 Oct": a scan's date in the Log. */
export const formatShortDate = (iso: string, lang: Lang) =>
	new Date(iso).toLocaleDateString(locale(lang), {
		weekday: "short",
		day: "numeric",
		month: "short",
	});

export const formatLongDate = (key: string, lang: Lang) =>
	new Date(`${key}T12:00:00`).toLocaleDateString(locale(lang), {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
