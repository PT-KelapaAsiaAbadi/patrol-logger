/**
 * reset-password: a supervisor gives someone who lost their password a new one.
 *
 * Returns the new password once so the supervisor can hand it over; no email is sent.
 * Supervisors can't reset their own password here (they'd sign themselves out of the only
 * screen that shows it); use the dashboard for that.
 *
 * Request:  POST { userId: string } with the supervisor's session
 * Response: { password: string }
 */
import {
	adminClient,
	cors,
	json,
	newPassword,
	requireSupervisor,
} from "../_shared/supervisor.ts";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST")
		return json({ error: "method_not_allowed" }, 405);

	const admin = adminClient();
	const supervisor = await requireSupervisor(req, admin);
	if (supervisor instanceof Response) return supervisor;

	let userId: string;
	try {
		userId = String((await req.json()).userId ?? "");
	} catch {
		return json({ error: "bad_request" }, 400);
	}
	if (!userId) return json({ error: "bad_request" }, 400);
	if (userId === supervisor)
		return json({ error: "cannot_change_self" }, 403);

	// Only people with a profile: never an auth account the app doesn't manage.
	const { data: profile } = await admin
		.from("profiles")
		.select("id")
		.eq("id", userId)
		.maybeSingle();
	if (!profile) return json({ error: "not_found" }, 404);

	const password = newPassword();
	const { error } = await admin.auth.admin.updateUserById(userId, {
		password,
	});
	if (error) {
		console.error("updateUserById failed", userId, error);
		return json({ error: "reset_failed" }, 500);
	}
	return json({ password });
});
