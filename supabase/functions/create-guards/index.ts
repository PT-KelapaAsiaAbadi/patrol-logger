/**
 * create-guards: a supervisor creates accounts, one per phone number. Guards by default; a
 * supervisor can also add another supervisor by passing role: "supervisor".
 *
 * Creating a login for someone else needs the service-role key, so this runs here and never in
 * the browser. Each new account gets a random password, returned once so the supervisor can hand
 * it out. People can't sign themselves up: sign-up is switched off for the whole project.
 *
 * TODO: optionally text a one-time code to confirm each new number (a "sendCode" flag). Not built
 * yet: it needs a real SMS provider. The earlier version is in commit 947b3c6. See README > TODO.
 *
 * Request:  POST { guards: { name: string; phone: string; role?: "guard" | "supervisor" }[] }
 *           with the supervisor's session
 * Response: { created: { user, password }[], existing: string[], failed: string[] }
 *           existing and failed list phone numbers (as normalised, or as typed if unreadable).
 */
import {
	adminClient,
	cors,
	json,
	newPassword,
	requireSupervisor,
} from "../_shared/supervisor.ts";
import { normalizePhone } from "../_shared/phone.ts";

const MAX_ACCOUNTS = 500;

type Role = "guard" | "supervisor";

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST")
		return json({ error: "method_not_allowed" }, 405);

	const admin = adminClient();
	const supervisor = await requireSupervisor(req, admin);
	if (supervisor instanceof Response) return supervisor;

	let body: {
		guards?: { name?: unknown; phone?: unknown; role?: unknown }[];
	};
	try {
		body = await req.json();
	} catch {
		return json({ error: "bad_request" }, 400);
	}
	const input = Array.isArray(body.guards) ? body.guards : [];
	if (input.length === 0 || input.length > MAX_ACCOUNTS) {
		return json({ error: "bad_request" }, 400);
	}

	const created: {
		user: { id: string; name: string; role: Role; phone: string };
		password: string;
	}[] = [];
	const existing: string[] = [];
	const failed: string[] = [];
	const seen = new Set<string>();

	// One at a time: the Auth admin API is rate limited, and the lists are small.
	for (const g of input) {
		const name = String(g.name ?? "")
			.trim()
			.replace(/\s+/g, " ");
		const typed = String(g.phone ?? "").trim();
		const phone = normalizePhone(typed);
		const role: Role | null =
			g.role === undefined || g.role === "guard"
				? "guard"
				: g.role === "supervisor"
					? "supervisor"
					: null;
		if (!name || name.length > 120 || !phone || !role || seen.has(phone)) {
			failed.push(phone ?? (typed || "(empty)"));
			continue;
		}
		seen.add(phone);

		const password = newPassword();
		const { data, error } = await admin.auth.admin.createUser({
			phone,
			password,
			phone_confirm: true, // the supervisor vouches for the number; nothing is texted here
			user_metadata: { name },
		});
		if (error || !data.user) {
			if (
				error?.code === "phone_exists" ||
				/already.*registered/i.test(error?.message ?? "")
			) {
				existing.push(phone);
			} else {
				console.error("createUser failed", phone, error);
				failed.push(phone);
			}
			continue;
		}

		const { error: profileError } = await admin
			.from("profiles")
			.insert({ id: data.user.id, name, phone, role });
		if (profileError) {
			console.error("profile insert failed", phone, profileError);
			await admin.auth.admin.deleteUser(data.user.id); // don't leave a login with no profile
			failed.push(phone);
			continue;
		}

		created.push({
			user: { id: data.user.id, name, role, phone },
			password,
		});
	}

	return json({ created, existing, failed });
});
