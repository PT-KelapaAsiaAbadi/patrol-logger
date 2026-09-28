/**
 * Phone numbers for the account Edge Functions. Keep `normalizePhone` in step with the copy in
 * src/lib/phone.ts, which the browser uses before sending a number here.
 *
 * TODO: sending and checking one-time codes to confirm a number is not built yet (it needs a real
 * SMS provider; the hosted project uses placeholder Twilio values). The earlier version is in
 * commit 947b3c6: signInWithOtp with shouldCreateUser: false to send, verifyOtp to check, ending
 * the session a right code creates. See README > TODO > Launch.
 */

/**
 * A phone number the way Supabase Auth stores it: digits only, country code first, no "+"
 * ("6281234567890"). Accepts what people type: "0812-3456-7890", "+62 812 3456 7890",
 * "62812...", or "812..." (an Indonesian mobile whose leading 0 a spreadsheet dropped).
 * Returns null when it can't be a phone number.
 *
 * Indonesian numbers must be mobiles: 08 plus 8 to 11 digits (10 to 13 digits as typed locally),
 * stored as 628 plus 8 to 11 digits. Numbers from other countries (e.g. +61) only need 8 to 15
 * digits, the international limit.
 *
 * TODO: switch to libphonenumber-js here and in src/lib/phone.ts if many foreign numbers get
 * registered (see the note there and README > TODO).
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
