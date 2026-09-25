/**
 * create-guards: a supervisor creates guard accounts, one per email.
 *
 * Creating a login for someone else needs the service-role key, so this runs here and never in
 * the browser. Each new guard gets a random password, returned once so the supervisor can hand
 * it out. No emails are sent.
 *
 * Request:  POST { guards: { name: string; email: string }[] }  with the supervisor's session
 * Response: { created: { user, password }[], existing: string[], failed: string[] }
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_GUARDS = 500;

const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, "Content-Type": "application/json" },
	});

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// No 0/o, 1/l/i: easy to read off a slip of paper and type on a phone. 31^12 is about 59 bits.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newPassword(): string {
	const out: string[] = [];
	const buf = new Uint32Array(1);
	while (out.length < 12) {
		crypto.getRandomValues(buf);
		const n = buf[0];
		if (n >= 0xffffffff - (0xffffffff % ALPHABET.length)) continue; // avoid modulo bias
		out.push(ALPHABET[n % ALPHABET.length]);
	}
	return `${out.slice(0, 4).join("")}-${out.slice(4, 8).join("")}-${out.slice(8).join("")}`;
}

Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
	if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

	const admin = createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
		{ auth: { persistSession: false, autoRefreshToken: false } },
	);

	// Who is asking? Must be an active supervisor.
	const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
	const { data: caller } = await admin.auth.getUser(token);
	if (!caller.user) return json({ error: "not_signed_in" }, 401);
	const { data: me } = await admin
		.from("profiles")
		.select("role, active")
		.eq("id", caller.user.id)
		.maybeSingle();
	if (!me || !me.active || me.role !== "supervisor") {
		return json({ error: "not_allowed" }, 403);
	}

	let body: { guards?: { name?: unknown; email?: unknown }[] };
	try {
		body = await req.json();
	} catch {
		return json({ error: "bad_request" }, 400);
	}
	const input = Array.isArray(body.guards) ? body.guards : [];
	if (input.length === 0 || input.length > MAX_GUARDS) {
		return json({ error: "bad_request" }, 400);
	}

	const created: { user: { id: string; name: string; role: "guard"; email: string }; password: string }[] = [];
	const existing: string[] = [];
	const failed: string[] = [];
	const seen = new Set<string>();

	// One at a time: the Auth admin API is rate limited, and the lists are small.
	for (const g of input) {
		const name = String(g.name ?? "").trim().replace(/\s+/g, " ");
		const email = String(g.email ?? "").trim().toLowerCase();
		if (!name || name.length > 120 || !isEmail(email) || seen.has(email)) {
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
			if (error?.code === "email_exists" || /already.*registered/i.test(error?.message ?? "")) {
				existing.push(email);
			} else {
				console.error("createUser failed", email, error);
				failed.push(email);
			}
			continue;
		}

		const { error: profileError } = await admin
			.from("profiles")
			.insert({ id: data.user.id, name, email, role: "guard" });
		if (profileError) {
			console.error("profile insert failed", email, profileError);
			await admin.auth.admin.deleteUser(data.user.id); // don't leave a login with no profile
			failed.push(email);
			continue;
		}

		created.push({ user: { id: data.user.id, name, role: "guard", email }, password });
	}

	return json({ created, existing, failed });
});
