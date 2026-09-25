// Shared by the tests. Everything here talks to the LOCAL Supabase stack (`npx supabase start`),
// never the hosted project: URLs and keys come from `supabase status`.
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

/** Local API URL and keys, read from the running stack. */
export function localStack() {
	let out;
	try {
		out = execSync("npx supabase status -o env", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		throw new Error(
			"Local Supabase isn't running. Start it with: npx supabase start",
		);
	}
	const env = Object.fromEntries(
		out
			.split(/\r?\n/)
			.map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
			.filter(Boolean)
			.map((m) => [m[1], m[2]]),
	);
	if (!env.API_URL?.startsWith("http://127.0.0.1")) {
		throw new Error(
			`Refusing to test against ${env.API_URL}: not the local stack`,
		);
	}
	return {
		url: env.API_URL,
		publishableKey: env.PUBLISHABLE_KEY,
		serviceRoleKey: env.SERVICE_ROLE_KEY,
	};
}

/** Accounts from supabase/seed.sql. */
export const SEED = {
	password: "patroli-local-1",
	supervisor: "supervisor@patroli.test",
	guard: "guard@patroli.test",
};

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

export function makeClients(stack) {
	const client = () =>
		createClient(stack.url, stack.publishableKey, noPersist);
	return {
		/** Signed out: what anyone on the internet gets. */
		anon: client,
		/** Bypasses Row Level Security. Only for setting up test state. */
		admin: () => createClient(stack.url, stack.serviceRoleKey, noPersist),
		async signedIn(email, password = SEED.password) {
			const c = client();
			const { error } = await c.auth.signInWithPassword({
				email,
				password,
			});
			if (error) throw new Error(`sign in ${email}: ${error.message}`);
			return c;
		},
	};
}

/** Tiny test reporter: prints each check, exits non-zero if any failed. */
export function reporter() {
	let pass = 0;
	let fail = 0;
	return {
		ok(cond, name, extra = "") {
			if (cond) {
				pass++;
				console.log("  ok  ", name);
			} else {
				fail++;
				console.log("  FAIL", name, extra);
			}
		},
		section: (name) => console.log(`\n${name}`),
		done() {
			console.log(`\n${pass} passed, ${fail} failed`);
			process.exit(fail ? 1 : 0);
		},
	};
}
