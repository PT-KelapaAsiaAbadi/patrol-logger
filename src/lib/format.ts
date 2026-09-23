import type { Lang } from '../i18n';

const locale = (lang: Lang) => (lang === 'id' ? 'id-ID' : 'en-AU');

/** YYYY-MM-DD in the phone's local time zone (WIB/WITA/WIT for guards in Indonesia). */
export function localDateKey(iso: string | Date = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const formatTime = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });

export const formatDateTime = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatLongDate = (key: string, lang: Lang) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' });
