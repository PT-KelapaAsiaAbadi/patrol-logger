/**
 * staff-phone: a supervisor manages someone's sign-in phone number.
 *
 *   change       Sets a new number (or a first one, for accounts made before phone sign-in).
 *                The new number counts as not confirmed (profiles.phone_verified_at = null).
 *
 * TODO: confirming a number with a one-time code (actions "send_code" and "verify_code") is not
 * built yet: it needs a real SMS provider, and the hosted project uses placeholder Twilio values.
 * An earlier version (commit 947b3c6) sent the code with signInWithOtp and checked it with
 * verifyOtp, then set phone_verified_at. See README > TODO > Launch.
 *
 * Request:  POST { action: "change", userId, phone } with the supervisor's session
 * Response: { phone }
 * Errors:   { error } with bad_request, invalid_phone, phone_exists, cannot_change_self, not_found,
 *           change_failed
 */
import {
	adminClient,
	cors,
	json,
	requireSupervisor,
} from "../_shared/supervisor.ts";
import { normalizePhone } from "../_shared/phone.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST")
		return json({ error: "method_not_allowed" }, 405);

	const admin = adminClient();
	const supervisor = await requireSupervisor(req, admin);
	if (supervisor instanceof Response) return supervisor;

	let body: { action?: unknown; userId?: unknown; phone?: unknown };
	try {
		body = await req.json();
	} catch {
		return json({ error: "bad_request" }, 400);
	}
	const userId = String(body.userId ?? "");
	if (!userId || body.action !== "change")
		return json({ error: "bad_request" }, 400);

	// Only people with a profile: never an auth account the app doesn't manage.
	const { data: profile } = await admin
		.from("profiles")
		.select("id, phone")
		.eq("id", userId)
		.maybeSingle();
	if (!profile) return json({ error: "not_found" }, 404);

	// Like reset-password: a supervisor changing their own number here could lock themselves out.
	if (userId === supervisor)
		return json({ error: "cannot_change_self" }, 403);
	const phone = normalizePhone(String(body.phone ?? ""));
	if (!phone) return json({ error: "invalid_phone" }, 400);
	if (phone === profile.phone) return json({ phone });

	// Checked here because Auth reports a taken number on update only as a generic 500.
	const { data: taken } = await admin
		.from("profiles")
		.select("id")
		.eq("phone", phone)
		.maybeSingle();
	if (taken) return json({ error: "phone_exists" }, 409);

	const { error } = await admin.auth.admin.updateUserById(userId, {
		phone,
		phone_confirm: true,
	});
	if (error) {
		if (error.code === "phone_exists")
			return json({ error: "phone_exists" }, 409);
		console.error("updateUserById failed", userId, error);
		return json({ error: "change_failed" }, 500);
	}
	const { error: profileError } = await admin
		.from("profiles")
		.update({ phone, phone_verified_at: null })
		.eq("id", userId);
	if (profileError) {
		// Auth already has the new number; put the old one back so the two stay in step.
		console.error("profile phone update failed", userId, profileError);
		if (profile.phone)
			await admin.auth.admin.updateUserById(userId, {
				phone: profile.phone,
				phone_confirm: true,
			});
		return json({ error: "change_failed" }, 500);
	}
	return json({ phone });
});
