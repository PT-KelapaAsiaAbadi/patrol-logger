// @ts-check

/** @param {number} value */
export const pad2 = (value) => String(value).padStart(2, '0');

/** "22:08" in local time. @param {number} ms */
export function formatClock(ms) {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "2026-09-20" for a local date. @param {Date} date */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** @param {string} dateKey */
export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Sunday, 20 September 2026" in the viewer's locale. @param {string} dateKey */
export function formatLongDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "36 min", "2 h", "2 h 3 min". @param {number} minutes */
export function formatDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "1 scan", "3 scans". @param {number} count @param {string} singular @param {string} [pluralForm] */
export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Minutes after midnight for "HH:MM". @param {string} clock */
export function minutesOfDay(clock) {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}
