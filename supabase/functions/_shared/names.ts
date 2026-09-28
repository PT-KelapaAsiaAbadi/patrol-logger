/**
 * A person's full name, as the account Edge Functions accept it. Keep in step with
 * src/lib/personName.ts, which the app checks with before sending.
 */

export const PERSON_NAME_MAX = 70;

/** Trims and collapses runs of spaces. */
export const tidyPersonName = (name: string) =>
	name.trim().replace(/\s+/g, " ");

/**
 * True for 1 to 70 characters starting with a letter, made only of letters, spaces and . , ' ’ -
 * (e.g. "Moh. Ma'ruf", "Siti Nur-Aini"). No digits or other symbols.
 */
export const isPersonName = (tidy: string) =>
	tidy.length >= 1 &&
	tidy.length <= PERSON_NAME_MAX &&
	/^\p{L}[\p{L}\p{M} .,'’-]*$/u.test(tidy);
