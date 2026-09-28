/**
 * Phone numbers, the sign-in identity for every account. Stored the way Supabase Auth stores them:
 * digits only, country code first, no "+" ("6281234567890"). Shown to people as "+62 812-3456-7890".
 * Keep `normalizePhone` in step with the copy in supabase/functions/_shared/phone.ts.
 */

/**
 * Turns what people type into the stored form. Accepts "0812-3456-7890", "+62 812 3456 7890",
 * "62812...", or "812..." (an Indonesian mobile whose leading 0 a spreadsheet dropped).
 * Returns null when it can't be a phone number.
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
