// What the scan screen says about location, with the browser's geolocation replaced by a scripted
// one: device location off, permission refused, slow GPS, and a rough fix improved by a precise one.
// Also: a scan the server refuses must say so, not claim "no signal".
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { localStack, makeClients, reporter, SEED } from "./local-supabase.mjs";

const PORT = 5212;
const BASE = `http://localhost:${PORT}/`;
const stack = localStack();
const { admin } = makeClients(stack);
const { ok, section, done } = reporter();

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
	shell: true,
	stdio: "ignore",
	env: {
		...process.env,
		VITE_SUPABASE_URL: stack.url,
		VITE_SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
	},
});
// Synchronous: the test exits right after, and an async kill would never run.
const stopVite = () => {
	if (process.platform === "win32")
		spawnSync("taskkill", ["/pid", String(vite.pid), "/T", "/F"], {
			stdio: "ignore",
		});
	else vite.kill();
};
for (let i = 0; ; i++) {
	try {
		if ((await fetch(BASE)).ok) break;
	} catch {
		/* not up yet */
	}
	if (i > 60) throw new Error("Vite dev server did not start");
	await new Promise((r) => setTimeout(r, 500));
}

// A stand-in for navigator.geolocation. Each call reads window.fakeGeo, a script of what the
// quick (rough) request and the precise watch should do, and when.
function fakeGeolocation() {
	const err = (code) => ({
		code,
		message: "fake",
		PERMISSION_DENIED: 1,
		POSITION_UNAVAILABLE: 2,
		TIMEOUT: 3,
	});
	const pos = (accuracy) => ({
		coords: { latitude: -6.2, longitude: 106.8, accuracy },
		timestamp: Date.now(),
	});
	const run = (step, onPos, onErr) => {
		if (!step) return;
		setTimeout(
			() =>
				step.error
					? onErr?.(err(step.error))
					: onPos(pos(step.accuracy)),
			step.after ?? 50,
		);
	};
	const watches = new Set();
	Object.defineProperty(navigator, "geolocation", {
		value: {
			getCurrentPosition(onPos, onErr, opts) {
				const s = window.fakeGeo ?? {};
				run(
					opts?.enableHighAccuracy ? s.precise?.[0] : s.rough,
					onPos,
					onErr,
				);
			},
			watchPosition(onPos, onErr) {
				const id = Math.random();
				watches.add(id);
				for (const step of window.fakeGeo?.precise ?? [])
					run(
						step,
						(p) => watches.has(id) && onPos(p),
						(e) => watches.has(id) && onErr?.(e),
					);
				return id;
			},
			clearWatch(id) {
				watches.delete(id);
			},
		},
	});
}

const channel =
	process.env.PW_CHANNEL ??
	(process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({
	headless: true,
	...(channel ? { channel } : {}),
});
const context = await browser.newContext();
await context.addInitScript(() => localStorage.setItem("patrol-lang", "en"));
await context.addInitScript(fakeGeolocation);
const page = await context.newPage();
const locationLine = page.locator(".scan-panel p").nth(1);

async function openScanWith(script) {
	await page.goto(BASE + "#/");
	await page.evaluate((s) => (window.fakeGeo = s), script);
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
}

try {
	section("sign in");
	await page.goto(BASE + "#/login");
	await page.getByLabel("Email").fill(SEED.guard);
	await page.getByLabel("Password").fill(SEED.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL(/#\/$/, { timeout: 15000 });
	ok(true, "guard signed in");

	section("location messages");
	await openScanWith({ rough: { error: 2 }, precise: [{ error: 2 }] });
	await page
		.getByText("This device can't find its location")
		.waitFor({ timeout: 10000 });
	ok(true, "device location off: says to turn on Location");

	await openScanWith({ rough: { error: 1 }, precise: [{ error: 1 }] });
	await page.getByText("Location is blocked").waitFor({ timeout: 10000 });
	ok(true, "permission refused: says location is blocked");
	await page.evaluate(() => (window.fakeGeo = { rough: { accuracy: 25 } }));
	await locationLine.getByRole("button", { name: "Try again" }).click();
	await page.getByText("Location found (±25 m)").waitFor({ timeout: 10000 });
	ok(true, "Try again picks up location once it's allowed");

	await openScanWith({
		rough: { error: 3, after: 100 },
		precise: [
			{ error: 3, after: 200 },
			{ accuracy: 8, after: 1500 },
		],
	});
	await page
		.getByText("Still finding your location")
		.waitFor({ timeout: 10000 });
	ok(true, "slow GPS: says it's still looking, not that there's no signal");
	await page.getByText("Location found (±8 m)").waitFor({ timeout: 10000 });
	ok(true, "and shows the fix when GPS arrives");

	await openScanWith({
		rough: { accuracy: 60, after: 50 },
		precise: [{ accuracy: 9, after: 1200 }],
	});
	await page.getByText("Location found (±60 m)").waitFor({ timeout: 10000 });
	ok(true, "a quick rough position comes first (works indoors)");
	await page.getByText("Location found (±9 m)").waitFor({ timeout: 10000 });
	ok(true, "then the precise one replaces it");

	section("server refusal is not 'no signal'");
	const { data: me } = await admin()
		.from("profiles")
		.select("id")
		.eq("email", SEED.guard)
		.single();
	const { data: cp } = await admin()
		.from("checkpoints")
		.select("manual_code")
		.order("route_order")
		.limit(1)
		.single();
	await admin().from("profiles").update({ active: false }).eq("id", me.id);
	try {
		await openScanWith({ rough: { accuracy: 20 } });
		await page.getByLabel("Code under the QR sticker").fill(cp.manual_code);
		await page.getByRole("button", { name: "Log scan" }).click();
		await page
			.getByText("The server refused this scan")
			.waitFor({ timeout: 10000 });
		ok(true, "a refused scan says the server refused it");
		ok(
			!(await page.getByText("Saved on phone").isVisible()),
			"and isn't shown as saved for later",
		);
		await page.goto(BASE + "#/");
		ok(
			!(await page.getByText("not sent yet").isVisible()),
			"nothing was queued",
		);
	} finally {
		await admin().from("profiles").update({ active: true }).eq("id", me.id);
	}
} catch (e) {
	ok(false, "(exception)", e.message.split("\n")[0]);
	await page
		.screenshot({ path: "e2e-failure.png", fullPage: true })
		.catch(() => {});
}

await browser.close();
stopVite();
done();
