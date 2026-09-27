/**
 * staff-phone: a supervisor manages someone's sign-in phone number.
 *
 *   change       Sets a new number (or a first one, for accounts made before phone sign-in).
 *                The new number counts as not confirmed until a code is checked.
 *   send_code    Texts a one-time code to the account's number by SMS.
 *   verify_code  Checks the code the staff member read out, and marks the number as confirmed.
 *
 * The code proves the number reaches the person the supervisor is registering. It doesn't sign
 * anyone in: the session a right code creates is ended at once.
 *
 * Request:  POST { action: "change", userId, phone }
 *           POST { action: "send_code", userId }
 *           POST { action: "verify_code", userId, code }       with the supervisor's session
 * Response: change { phone } · send_code { sent: true } · verify_code { verifiedAt }
 * Errors:   { error } with bad_request, invalid_phone, phone_exists, cannot_change_self, not_found,
 *           no_phone, too_soon (a code was just sent), send_failed, wrong_code
 */
import {
	adminClient,
	cors,
	json,
	requireSupervisor,
} from "../_shared/supervisor.ts";
import {
	checkPhoneCode,
	normalizePhone,
	sendPhoneCode,
} from "../_shared/phone.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST")
		return json({ error: "method_not_allowed" }, 405);

	const admin = adminClient();
	const supervisor = await requireSupervisor(req, admin);
	if (supervisor instanceof Response) return supervisor;

	let body: {
		action?: unknown;
		userId?: unknown;
		phone?: unknown;
		code?: unknown;
	};
	try {
		body = await req.json();
	} catch {
		return json({ error: "bad_request" }, 400);
	}
	const userId = String(body.userId ?? "");
	if (!userId) return json({ error: "bad_request" }, 400);

	// Only people with a profile: never an auth account the app doesn't manage.
	const { data: profile } = await admin
		.from("profiles")
		.select("id, phone")
		.eq("id", userId)
		.maybeSingle();
	if (!profile) return json({ error: "not_found" }, 404);

	switch (body.action) {
		case "change": {
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
				console.error(
					"profile phone update failed",
					userId,
					profileError,
				);
				if (profile.phone)
					await admin.auth.admin.updateUserById(userId, {
						phone: profile.phone,
						phone_confirm: true,
					});
				return json({ error: "change_failed" }, 500);
			}
			return json({ phone });
		}

		case "send_code": {
			if (!profile.phone) return json({ error: "no_phone" }, 400);
			const result = await sendPhoneCode(profile.phone);
			if (result === "too_soon") return json({ error: "too_soon" }, 429);
			if (result === "send_failed")
				return json({ error: "send_failed" }, 502);
			return json({ sent: true });
		}

		case "verify_code": {
			if (!profile.phone) return json({ error: "no_phone" }, 400);
			const code = String(body.code ?? "").replace(/\s+/g, "");
			if (!/^\d{6}$/.test(code))
				return json({ error: "wrong_code" }, 400);

			const right = await checkPhoneCode(profile.phone, code, (token) =>
				admin.auth.admin.signOut(token, "local"),
			);
			if (!right) return json({ error: "wrong_code" }, 400);

			const verifiedAt = new Date().toISOString();
			const { error } = await admin
				.from("profiles")
				.update({ phone_verified_at: verifiedAt })
				.eq("id", userId);
			if (error) {
				console.error("marking phone verified failed", userId, error);
				return json({ error: "change_failed" }, 500);
			}
			return json({ verifiedAt });
		}

		default:
			return json({ error: "bad_request" }, 400);
	}
});
