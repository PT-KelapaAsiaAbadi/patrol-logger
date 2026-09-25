/**
 * create-guards: a supervisor creates accounts, one per email. Guards by default; a supervisor
 * can also add another supervisor by passing role: "supervisor".
 *
 * Creating a login for someone else needs the service-role key, so this runs here and never in
 * the browser. Each new account gets a random password, returned once so the supervisor can hand
 * it out. No emails are sent.
 *
 * Request:  POST { guards: { name: string; email: string; role?: "guard" | "supervisor" }[] }
 *           with the supervisor's session
 * Response: { created: { user, password }[], existing: string[], failed: string[] }
 */
import {
	adminClient,
	cors,
	json,
	newPassword,
	requireSupervisor,
} from "../_shared/supervisor.ts";

const MAX_ACCOUNTS = 500;

type Role = "guard" | "supervisor";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST")
		return json({ error: "method_not_allowed" }, 405);

	const admin = adminClient();
	const supervisor = await requireSupervisor(req, admin);
	if (supervisor instanceof Response) return supervisor;

	let body: {
		guards?: { name?: unknown; email?: unknown; role?: unknown }[];
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
		user: { id: string; name: string; role: Role; email: string };
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
		const email = String(g.email ?? "")
			.trim()
			.toLowerCase();
		const role: Role | null =
			g.role === undefined || g.role === "guard"
				? "guard"
				: g.role === "supervisor"
					? "supervisor"
					: null;
		if (
			!name ||
			name.length > 120 ||
			!isEmail(email) ||
			!role ||
			seen.has(email)
		) {
			failed.push(email || "(empty)");
			continue;
		}
		seen.add(email);

		const password = newPassword();
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true, // the supervisor vouches for the address; no email is sent
			user_metadata: { name },
		});
		if (error || !data.user) {
			if (
				error?.code === "email_exists" ||
				/already.*registered/i.test(error?.message ?? "")
			) {
				existing.push(email);
			} else {
				console.error("createUser failed", email, error);
				failed.push(email);
			}
			continue;
		}

		const { error: profileError } = await admin
			.from("profiles")
			.insert({ id: data.user.id, name, email, role });
		if (profileError) {
			console.error("profile insert failed", email, profileError);
			await admin.auth.admin.deleteUser(data.user.id); // don't leave a login with no profile
			failed.push(email);
			continue;
		}

		created.push({
			user: { id: data.user.id, name, role, email },
			password,
		});
	}

	return json({ created, existing, failed });
});
