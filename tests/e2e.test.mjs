// Drives the real app in a headless browser against the local Supabase stack.
// Starts its own Vite dev server on port 5210, pointed at the local stack.
// Browser: Chromium from `npx playwright-core install chromium`, or set PW_CHANNEL
// (defaults to the installed Microsoft Edge on Windows).
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright-core";
import { localStack, reporter, SEED } from "./local-supabase.mjs";

const PORT = 5210;
const BASE = `http://localhost:${PORT}/`;
const stack = localStack();
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

const channel =
	process.env.PW_CHANNEL ??
	(process.platform === "win32" ? "msedge" : undefined);
const browser = await chromium.launch({
	headless: true,
	...(channel ? { channel } : {}),
});
const context = await browser.newContext();
await context.addInitScript(() => localStorage.setItem("patrol-lang", "en"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text());
});

async function signIn(email, password) {
	await page.goto(BASE + "#/login");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: "Sign in" }).click();
}
async function signOut() {
	await page.getByRole("button", { name: "Sign out" }).click();
	await page.waitForURL(/#\/login/);
}
const acceptNextDialog = () => page.once("dialog", (d) => void d.accept());
const text = (s, opts) =>
	page.getByText(s, opts).first().waitFor({ timeout: 15000 });

try {
	section("login");
	await signIn(SEED.supervisor, "wrong-password-1");
	await text("Email or password is incorrect");
	ok(true, "wrong password shows the error");
	await signIn(SEED.supervisor, SEED.password);
	await page.waitForURL(/#\/supervisor$/, { timeout: 15000 });
	await text("Budi Santoso");
	ok(true, "supervisor lands on the log with today's guards");

	section("checkpoints");
	await page.getByRole("link", { name: "Checkpoints and QR" }).click();
	await page.locator(".sticker").first().waitFor({ timeout: 20000 });
	ok((await page.locator(".sticker").count()) === 8, "8 QR labels render");
	const codes = await page.locator(".sticker-code").allTextContents();
	const names = await page.locator(".sticker-name").allTextContents();
	ok(
		codes.every((c) => /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(c.trim())),
		"manual codes shown",
	);

	await page.getByLabel("Checkpoint name").fill("Pos belakang");
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	await text("1 of 9 selected");
	ok(true, "new checkpoint added and pre-selected for printing");
	await page.getByLabel("Select all").check();
	await text("9 of 9 selected");
	ok(
		await page.getByRole("button", { name: "Print QR (9)" }).isEnabled(),
		"select all enables Print QR (9)",
	);

	const route = page.locator("section", {
		has: page.getByRole("heading", { name: "Round order" }),
	});
	const lastRow = route.locator("tbody tr").last();
	await lastRow.getByRole("button", { name: "Rename" }).click();
	await lastRow.getByRole("textbox").fill("Pos belakang gudang");
	await lastRow.getByRole("button", { name: "Save" }).click();
	await route
		.getByRole("cell", { name: "Pos belakang gudang" })
		.waitFor({ timeout: 15000 });
	ok(true, "checkpoint renamed from the round table");

	acceptNextDialog();
	await route
		.locator("tbody tr")
		.first()
		.getByRole("button", { name: "Replace sticker" })
		.click();
	await text(`New sticker for "${names[0].trim()}" is ready`);
	// The table reloads just after the message appears.
	const firstCode = route.locator("tbody tr").first().locator("td").nth(2);
	await page.waitForFunction(
		([el, old]) => el.textContent.trim() !== old,
		[await firstCode.elementHandle(), codes[0].trim()],
		{ timeout: 15000 },
	);
	ok(true, "replacing a sticker issues a new code");

	section("accounts");
	await page.getByRole("link", { name: "Accounts" }).click();
	await page
		.getByRole("cell", { name: SEED.guard })
		.waitFor({ timeout: 15000 });
	ok(true, "account list shows emails");
	const email = `siti${Date.now()}@patroli.test`;
	const addPanel = page.locator("section", {
		has: page.getByRole("heading", { name: "Add one account" }),
	});
	await addPanel.getByLabel("Full name").fill("Siti Rahma");
	await addPanel.getByLabel("Email").fill(email);
	await addPanel.getByRole("button", { name: "Add account" }).click();
	await text("These passwords are shown only once");
	const firstPassword = (
		await page.locator("td.font-mono").first().textContent()
	).trim();
	ok(
		/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(firstPassword),
		"one-time password shown",
	);

	const sitiRow = page.locator("tr", {
		has: page.getByRole("cell", { name: email }),
	});
	acceptNextDialog();
	await sitiRow.getByRole("button", { name: "New password" }).click();
	await text("New password for Siti Rahma:");
	const password = (
		await page.locator(".notice span.font-mono").first().textContent()
	).trim();
	ok(password !== firstPassword, "password reset shows a new password");
	await signOut();

	section("guard round");
	await signIn(email, firstPassword);
	await text("Email or password is incorrect");
	ok(true, "old password no longer works");
	await signIn(email, password);
	await page.waitForURL(/#\/$/, { timeout: 15000 });
	await text("0 of 9 checkpoints checked today");
	ok(true, "guard sees the 9-stop round");
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
	// No camera in a headless browser, so the page falls back to typing the code.
	await page
		.getByLabel("Code under the QR sticker")
		.fill(codes[1].trim().toLowerCase().replace("-", ""));
	await page.getByRole("button", { name: "Log scan" }).click();
	await text("Logged", { exact: true });
	ok(
		await page.getByText(names[1].trim()).first().isVisible(),
		"typed code logged at the right checkpoint",
	);

	await page.getByRole("link", { name: "Add report" }).click();
	await page.getByLabel("What happened?").fill("Lampu koridor mati.");
	await page.locator('input[type="file"]').setInputFiles({
		name: "photo.png",
		mimeType: "image/png",
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
			"base64",
		),
	});
	await page.locator("ul img").first().waitFor({ timeout: 15000 });
	await page.getByRole("button", { name: "Send report" }).click();
	await text("Report sent.");
	await page.getByRole("link", { name: "Back to round" }).click();
	await text("1 of 9 checkpoints checked today");
	ok(true, "report with photo sent, round progress updates");

	section("offline queue");
	await context.setOffline(true);
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
	await page.getByLabel("Code under the QR sticker").fill(codes[2].trim());
	await page.getByRole("button", { name: "Log scan" }).click();
	await text("Saved on phone");
	ok(true, "offline scan saved on the phone");

	// Back "online" but with the server unreachable, then reload: the scan must survive.
	const toServer = (url) => url.href.startsWith(stack.url);
	await context.route(toServer, (r) => r.abort());
	await context.setOffline(false);
	await page.goto(BASE + "#/");
	await text("1 scans not sent yet");
	ok(true, "queued scan survives a reload");
	const dbs = await page.evaluate(async () =>
		(await indexedDB.databases()).map((d) => d.name),
	);
	ok(
		dbs.includes("patroli"),
		"queue is stored in IndexedDB",
		JSON.stringify(dbs),
	);

	page.once("dialog", (d) => void d.dismiss());
	await page.getByRole("button", { name: "Sign out" }).click();
	await page.waitForTimeout(500);
	ok(
		!page.url().includes("login"),
		"sign-out warns about the unsent scan and can be cancelled",
	);

	await context.unroute(toServer);
	await context.setOffline(true);
	await context.setOffline(false); // fires "online", which starts a sync
	await text("2 of 9 checkpoints checked today");
	await page
		.getByText("scans not sent yet")
		.waitFor({ state: "detached", timeout: 15000 });
	ok(true, "queued scan syncs when the server is reachable again");
	await signOut();

	section("supervisor sees it");
	await signIn(SEED.supervisor, SEED.password);
	await page.waitForURL(/#\/supervisor$/);
	await page.getByRole("link", { name: "View report" }).first().click();
	await text("Lampu koridor mati.");
	const photo = page.locator("article ul img").first();
	await photo.waitFor({ timeout: 15000 });
	// The photo comes from a signed Storage URL; give it time to download before judging it.
	const loaded = await photo
		.evaluate(
			(img) =>
				new Promise((resolve) => {
					if (img.complete) return resolve(img.naturalWidth > 0);
					img.addEventListener("load", () =>
						resolve(img.naturalWidth > 0),
					);
					img.addEventListener("error", () => resolve(false));
					setTimeout(() => resolve(false), 15000);
				}),
		)
		.catch(() => false);
	ok(loaded, "report note and photo visible to the supervisor");

	await page.getByRole("link", { name: "Accounts" }).click();
	const row = page.locator("tr", {
		has: page.getByRole("cell", { name: email }),
	});
	acceptNextDialog();
	await row.getByRole("button", { name: "Deactivate" }).click();
	await row
		.getByRole("cell", { name: "Deactivated" })
		.waitFor({ timeout: 15000 });
	await signOut();
	await signIn(email, password);
	await text("Email or password is incorrect");
	ok(true, "a deactivated account cannot sign in");
} catch (e) {
	ok(false, "(exception)", e.message.split("\n")[0]);
	await page
		.screenshot({ path: "e2e-failure.png", fullPage: true })
		.catch(() => {});
}

// Expected noise: the deliberate wrong-password sign-ins (400), requests aborted while testing
// the offline queue, and camera errors (no camera in a headless browser).
const unexpected = errors.filter(
	(m) =>
		!/status of 400|ERR_FAILED|ERR_INTERNET_DISCONNECTED|camera|NotFoundError|NotAllowedError|getUserMedia|Requested device not found/i.test(
			m,
		),
);
ok(
	unexpected.length === 0,
	"no unexpected console errors",
	unexpected.join(" | "),
);
await browser.close();
stopVite();
done();
