/**
 * Shared by the Edge Functions that manage accounts. Each runs with the service-role key and
 * must only act for an active supervisor, which `requireSupervisor` checks.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers":
		"authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, "Content-Type": "application/json" },
	});

export function adminClient(): SupabaseClient {
	return createClient(
		Deno.env.get("SUPABASE_URL")!,
		Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
		{ auth: { persistSession: false, autoRefreshToken: false } },
	);
}

/**
 * The calling supervisor's user id, or a Response to return straight away
 * (401 when not signed in, 403 when not an active supervisor).
 */
export async function requireSupervisor(
	req: Request,
	admin: SupabaseClient,
): Promise<string | Response> {
	const token =
		req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
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
	return caller.user.id;
}

// No 0/o, 1/l/i: easy to read off a slip of paper and type on a phone. 31^12 is about 59 bits.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A random password like "k7mq-x4pt-9hna". */
export function newPassword(): string {
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
