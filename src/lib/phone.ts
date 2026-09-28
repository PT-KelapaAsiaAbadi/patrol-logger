/**
 * Phone numbers, the sign-in identity for every account. Stored the way Supabase Auth stores them:
 * digits only, country code first, no "+" ("6281234567890"). Shown to people as "+62 812-3456-7890".
 * Keep `normalizePhone` in step with the copy in supabase/functions/_shared/phone.ts.
 */

/** Longest thing a phone field accepts, e.g. "+62 812-3456-78901" plus some slack. */
export const PHONE_INPUT_MAX = 20;

/**
 * Drops anything a phone number can't contain while it's being typed or pasted: only digits,
 * "+", spaces, dashes and brackets stay.
 */
export const keepPhoneChars = (input: string) =>
	input.replace(/[^\d+\s\-()]/g, "").slice(0, PHONE_INPUT_MAX);

/**
 * Turns what people type into the stored form. Accepts "0812-3456-7890", "+62 812 3456 7890",
 * "62812...", or "812..." (an Indonesian mobile whose leading 0 a spreadsheet dropped).
 * Returns null when it can't be a phone number.
 *
 * Indonesian numbers must be mobiles: 08 plus 8 to 11 digits (10 to 13 digits as typed locally),
 * stored as 628 plus 8 to 11 digits. Numbers from other countries (e.g. +61) only need 8 to 15
 * digits, the international limit.
 *
 * TODO: if many numbers from other countries get registered, validate with libphonenumber-js
 * (every country's lengths and prefixes) instead of the 8-15 digit rule. It adds roughly 80 KB or
 * more to a ~100 KB app on guards' prepaid data, so it isn't worth it for Indonesian mobiles only.
 * Change the server copy (supabase/functions/_shared/phone.ts) too. See README > TODO.
 */
export function normalizePhone(input: string): string | null {
	let digits = input.trim().replace(/[\s\-().]/g, "");
	if (!/^\+?\d+$/.test(digits)) return null;
	if (digits.startsWith("+")) digits = digits.slice(1);
	else if (digits.startsWith("00"))
		digits = digits.slice(2); // international prefix
	else if (digits.startsWith("0"))
		digits = "62" + digits.slice(1); // Indonesian local format
	else if (digits.startsWith("8")) digits = "62" + digits;
	if (digits.startsWith("62"))
		return /^628\d{8,11}$/.test(digits) ? digits : null;
	return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "+62 812-3456-7890" for Indonesian numbers; other countries as "+" and the digits. */
export function formatPhone(phone: string): string {
	if (!phone.startsWith("62")) return `+${phone}`;
	const rest = phone.slice(2);
	return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(
		/-$/,
		"",
	);
}
