/**
 * Phone numbers for the account Edge Functions. Keep `normalizePhone` in step with the copy in
 * src/lib/phone.ts, which the browser uses before sending a number here.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * A phone number the way Supabase Auth stores it: digits only, country code first, no "+"
 * ("6281234567890"). Accepts what people type: "0812-3456-7890", "+62 812 3456 7890",
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

/** A client with the public key, for the Auth calls a signed-out person would make. Keeps no session. */
function publicClient() {
	return createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_ANON_KEY")!,
		{ auth: { persistSession: false, autoRefreshToken: false } },
	);
}

export type SendCodeResult = "sent" | "too_soon" | "send_failed";

/**
 * Texts a one-time code to an existing account's number, through the project's SMS provider.
 * Never creates an account: an unknown number gets nothing.
 *
 * TODO: the hosted project has placeholder Twilio values, so this returns "send_failed" there.
 * Enter a real SMS provider, or add a Send SMS hook that delivers codes another way (e.g. an
 * Android phone with a local SIM). See README > TODO > Launch.
 */
export async function sendPhoneCode(phone: string): Promise<SendCodeResult> {
	const { error } = await publicClient().auth.signInWithOtp({
		phone: `+${phone}`,
		options: { shouldCreateUser: false, channel: "sms" },
	});
	if (!error) return "sent";
	if (error.code === "over_sms_send_rate_limit" || error.status === 429)
		return "too_soon";
	console.error("sending a phone code failed", phone, error);
	return "send_failed";
}

/**
 * Checks a code the staff member read out. A right code signs that person in, so the session is
 * ended at once: the point is only to prove the number reaches them. Returns false for a wrong or
 * expired code.
 */
export async function checkPhoneCode(
	phone: string,
	code: string,
	endSession: (accessToken: string) => Promise<unknown>,
): Promise<boolean> {
	const { data, error } = await publicClient().auth.verifyOtp({
		phone: `+${phone}`,
		token: code,
		type: "sms",
	});
	if (error || !data.session) return false;
	await endSession(data.session.access_token);
	return true;
}
