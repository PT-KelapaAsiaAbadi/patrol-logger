// Scans a checkpoint through the real camera path: the browser's fake camera shows a signed QR
// sticker, which keeps being decoded several times a second like a real one held in view.
// One scan action must record exactly one scan, and the report must attach to it.
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { writeQrVideo } from "./fake-camera.mjs";
import { localStack, makeClients, reporter, SEED } from "./local-supabase.mjs";

const PORT = 5211;
const BASE = `http://localhost:${PORT}/`;
const stack = localStack();
const { admin, signedIn } = makeClients(stack);
const { ok, section, done } = reporter();

// The sticker to show the camera: the 4th checkpoint, which the other tests don't scan.
const sup = await signedIn(SEED.supervisor);
const { data: cps } = await sup
	.from("checkpoints")
	.select("id, name")
	.order("route_order");
const target = cps[3];
const { data: payload } = await sup.rpc("qr_payload", {
	p_checkpoint_id: target.id,
});
const video = join(tmpdir(), "patroli-fake-camera.y4m");
writeQrVideo(payload, video);

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

const channel =
	process.env.PW_CHANNEL ??
	(process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({
	headless: true,
	...(channel ? { channel } : {}),
	args: [
		"--use-fake-ui-for-media-stream",
		"--use-fake-device-for-media-stream",
		`--use-file-for-fake-video-capture=${video}`,
	],
});
const context = await browser.newContext({ permissions: ["camera"] });
await context.addInitScript(() => localStorage.setItem("patrol-lang", "en"));
const page = await context.newPage();

const scansHere = async () => {
	const { data } = await admin()
		.from("scans")
		.select("id")
		.eq("checkpoint_id", target.id);
	return data.map((s) => s.id);
};

try {
	section("camera scan");
	const before = await scansHere();
	await page.goto(BASE + "#/login");
	await page.getByLabel("Email").fill(SEED.guard);
	await page.getByLabel("Password").fill(SEED.password);
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.waitForURL(/#\/$/, { timeout: 15000 });
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
	await page.getByText("Logged", { exact: true }).waitFor({ timeout: 20000 });
	ok(
		await page.getByText(target.name).first().isVisible(),
		`camera read the sticker for "${target.name}"`,
	);

	// Frames already being decoded when the camera stops must not add a second scan.
	await page.waitForTimeout(3000);
	const afterScan = (await scansHere()).filter((id) => !before.includes(id));
	ok(
		afterScan.length === 1,
		"exactly one scan recorded",
		`${afterScan.length} scans`,
	);

	await page.getByRole("link", { name: "Add report" }).click();
	await page.getByLabel("What happened?").fill("Pintu terbuka.");
	await page.getByRole("button", { name: "Send report" }).click();
	await page.getByText("Report sent.").waitFor({ timeout: 15000 });
	await page.waitForTimeout(2000);
	const afterReport = (await scansHere()).filter(
		(id) => !before.includes(id),
	);
	ok(
		afterReport.length === 1,
		"still one scan after writing the report",
		`${afterReport.length} scans`,
	);
	const { data: reports } = await admin()
		.from("reports")
		.select("scan_id")
		.in("scan_id", afterReport);
	ok(
		reports.length === 1 && reports[0].scan_id === afterScan[0],
		"the report is attached to that scan",
	);
} catch (e) {
	ok(false, "(exception)", e.message.split("\n")[0]);
	await page
		.screenshot({ path: "e2e-failure.png", fullPage: true })
		.catch(() => {});
}

await browser.close();
stopVite();
done();
