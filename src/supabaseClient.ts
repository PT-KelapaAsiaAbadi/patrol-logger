import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types.ts";

// Vite only exposes variables prefixed with VITE_ to browser code. Set them in .env.local
// and restart `npm run dev`, which reads env files only at startup.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
	throw new Error(
		"Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Set them in .env.local and restart npm run dev.",
	);
}

// Injecting database schema into client
export const supabase = createClient<Database>(
	supabaseUrl,
	supabasePublishableKey,
);
