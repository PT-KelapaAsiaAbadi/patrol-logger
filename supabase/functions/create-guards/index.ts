/**
 * create-guards: a supervisor creates accounts, one per phone number. Guards by default; a
 * supervisor can also add another supervisor by passing role: "supervisor".
 *
 * Creating a login for someone else needs the service-role key, so this runs here and never in
 * the browser. Each new account gets a random password, returned once so the supervisor can hand
 * it out. People can't sign themselves up: sign-up is switched off for the whole project.
 *
 * With sendCode: true, each new account is also texted a one-time code, which the staff member
 * reads back to the supervisor to confirm the number (staff-phone, "verify_code"). Each text costs
 * money and counts towards the project's hourly SMS limit, so the app only offers it for one
 * account at a time.
 *
 * Request:  POST { guards: { name: string; phone: string; role?: "guard" | "supervisor" }[],
 *                  sendCode?: boolean } with the supervisor's session
 * Response: { created: { user, password, codeSent? }[], existing: string[], failed: string[] }
 *           existing and failed list phone numbers (as normalised, or as typed if unreadable).
 */
import {
	adminClient,
	cors,
	json,
	newPassword,
	requireSupervisor,
} from "../_shared/supervisor.ts";
import { normalizePhone, sendPhoneCode } from "../_shared/phone.ts";

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
		sendCode?: unknown;
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
	const sendCode = body.sendCode === true;

	const created: {
		user: { id: string; name: string; role: Role; phone: string };
		password: string;
		codeSent?: boolean;
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
			// A code that can't be sent doesn't undo the account: it can be sent again later.
			...(sendCode && {
				codeSent: (await sendPhoneCode(phone)) === "sent",
			}),
		});
	}

	return json({ created, existing, failed });
});
