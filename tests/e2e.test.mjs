// Drives the real app in a headless browser against the local Supabase stack.
// Starts its own Vite dev server on port 5210, pointed at the local stack.
// Browser: Chromium from `npx playwright-core install chromium`, or set PW_CHANNEL
// (defaults to the installed Microsoft Edge on Windows).
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
const context = await browser.newContext({
	// Where the guard's phone "is". Matches the second checkpoint once it's pinned below.
	permissions: ["geolocation"],
	geolocation: { latitude: -6.21, longitude: 106.81, accuracy: 10 },
});
// Map tiles and address lookups are faked: tests shouldn't lean on OpenStreetMap's servers.
const BLANK_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
	"base64",
);
await context.route("https://tile.openstreetmap.org/**", (r) =>
	r.fulfill({ contentType: "image/png", body: BLANK_PNG }),
);
await context.route("https://nominatim.openstreetmap.org/search**", (r) =>
	r.fulfill({
		json: [
			{
				display_name: "Jl. Contoh 1, Jakarta",
				lat: "-6.2",
				lon: "106.8",
			},
		],
	}),
);
await context.route("https://nominatim.openstreetmap.org/reverse**", (r) =>
	r.fulfill({ json: { display_name: "Jl. Contoh 1, Jakarta" } }),
);
await context.addInitScript(() => localStorage.setItem("patrol-lang", "en"));
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
	if (m.type() === "error") errors.push(m.text());
});
// The console only says "status of 401"; this records which request it was, for the report.
const failedRequests = [];
page.on("response", (r) => {
	if (r.status() >= 400)
		failedRequests.push(
			`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`,
		);
});

/** Signs in through the form, with the number typed however a person would. */
async function signIn(phone, password) {
	await page.goto(BASE + "#/login");
	await page.getByLabel("Phone number").fill(phone);
	// exact: the show/hide button is labelled "Show password".
	await page.getByLabel("Password", { exact: true }).fill(password);
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
	await page.goto(BASE + "#/login");
	const themeAttr = () =>
		page.evaluate(() => document.documentElement.dataset.theme ?? "system");
	await page.getByRole("button", { name: "Dark" }).click();
	ok((await themeAttr()) === "dark", "the theme switch turns dark mode on");
	await page.reload();
	ok((await themeAttr()) === "dark", "and the choice is remembered");
	await page.getByRole("button", { name: "Match device" }).click();
	ok(
		(await themeAttr()) === "system",
		"Match device follows the device again",
	);
	await signIn(SEED.supervisorTyped, "wrong-password-1");
	await text("Phone number or password is incorrect");
	ok(true, "wrong password shows the error");
	await signIn(SEED.supervisorTyped, SEED.password);
	await page.waitForURL(/#\/supervisor$/, { timeout: 15000 });
	await page
		.getByRole("heading", { name: "Today", level: 1 })
		.waitFor({ timeout: 15000 });
	ok(true, "supervisor lands on Today");
	for (const heading of [
		"Needs review",
		"Not yet visited",
		"Completed checkpoints",
		"Guards on duty",
	])
		await page.getByRole("heading", { name: heading, level: 2 }).waitFor();
	ok(true, "Today shows its four sections");
	const notVisitedCard = page.locator("section.area-missed");
	await notVisitedCard.getByText("8 of 8").waitFor({ timeout: 15000 });
	ok(
		(await notVisitedCard.locator("tbody tr").count()) === 8,
		"before any scan, all 8 checkpoints are not yet visited",
	);
	const dutyCard = page.locator("section.area-duty");
	await dutyCard
		.locator("tr", { hasText: "Budi Santoso" })
		.getByText("Not started")
		.waitFor();
	ok(
		(await dutyCard.getByText("0 of 1 patrolling").count()) === 1,
		"before any scan, the guard is listed as not started",
	);
	await page
		.locator("section.area-review")
		.getByText("No scans need a look today.")
		.waitFor();
	ok(true, "before any scan, Needs review is empty");
	await page.getByRole("link", { name: "Schedule" }).click();
	section("schedule");
	await text("21 shifts have nobody assigned.");
	ok(true, "an empty week: every shift is flagged as having nobody");
	const morningToday = page.locator(
		".sched-grid tbody tr:first-child td.is-today .sched-cell",
	);
	await morningToday.click();
	const assignDialog = page.locator(".sched-dialog");
	await assignDialog.getByLabel("Budi Santoso").check();
	await assignDialog.getByRole("button", { name: "Save" }).click();
	await morningToday.getByText("Budi Santoso").waitFor({ timeout: 15000 });
	await text("20 shifts have nobody assigned.");
	ok(true, "a supervisor assigns a guard to today's morning shift");
	await page.getByRole("button", { name: "Copy last week" }).click();
	await text("Nothing to copy: last week has no shifts that fit.");
	await page.getByRole("button", { name: "Next week" }).click();
	await page.getByRole("button", { name: "Copy last week" }).click();
	await text("1 shift copied from last week.");
	await page
		.locator(".sched-grid tbody tr:first-child")
		.getByText("Budi Santoso")
		.waitFor({ timeout: 15000 });
	ok(true, "copy last week repeats the shift in the next week");
	await page.getByRole("button", { name: "This week" }).click();
	await morningToday.getByText("Budi Santoso").waitFor({ timeout: 15000 });
	await morningToday.click();
	await assignDialog.getByLabel("Budi Santoso").uncheck();
	await assignDialog.getByRole("button", { name: "Save" }).click();
	await morningToday.getByText("Assign").waitFor({ timeout: 15000 });
	ok(true, "taking the guard off the shift empties it again");
	await page.getByRole("link", { name: "Log Database" }).click();
	await text("Every scan, newest first.");
	ok(true, "Log Database opens");

	section("checkpoints");
	await page.getByRole("link", { name: "Checkpoints and QR" }).click();
	const route = page.locator("section", {
		has: page.getByRole("heading", { name: "Round order" }),
	});
	await route.locator("tbody tr").first().waitFor({ timeout: 20000 });
	ok((await route.locator("tbody tr").count()) === 8, "8 checkpoints listed");
	// On a desktop the QR column is always there, empty until something is selected.
	ok(
		(await page.locator(".qr-panel").isVisible()) &&
			(await page.locator(".qr-panel .qr-sticker").count()) === 0,
		"the QR column is empty until a checkpoint is selected",
	);
	ok(
		(await page
			.getByRole("button", { name: "Print selected" })
			.isDisabled()) &&
			(await page
				.getByRole("button", { name: "Download as PDF" })
				.isDisabled()),
		"Print selected and Download as PDF wait for a selection",
	);
	const codes = await route.locator("td.c-code").allTextContents();
	const names = await route.locator("td.c-name").allTextContents();
	ok(
		codes.every((c) => /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(c.trim())),
		"manual codes shown",
	);

	// On a desktop the form opens from the button beside the title.
	ok(
		!(await page.getByLabel("Checkpoint name").isVisible()),
		"no add-checkpoint form on the page on a desktop",
	);
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	// A wide dialog: the form on the left, the map on the right.
	const picker = page.getByRole("dialog");
	await picker.getByLabel("Checkpoint name").waitFor();
	ok(
		await picker
			.getByLabel("Checkpoint name")
			.evaluate((el) => el === document.activeElement),
		"Add checkpoint opens a dialog with the cursor in the name field",
	);

	// Name rules and the required location are checked before anything is saved.
	await page.getByLabel("Checkpoint name").fill("Po");
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	await text("Use at least 3 characters for the name.");
	await page.getByLabel("Checkpoint name").fill("lobi UTAMA");
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	await text("A checkpoint with this name already exists.");
	await page.getByLabel("Checkpoint name").fill("Pos belakang");
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	await text("Set the checkpoint's location on the map first, then add it.");
	ok(
		(await route.locator("tbody tr").count()) === 8,
		"a too-short name, a repeated name and a missing location are refused",
	);
	await picker.locator(".leaflet-container").waitFor({ timeout: 15000 });
	await picker.locator(".picker-map").click(); // drop the pin by tapping the map
	await picker.getByText(/^-?\d+\.\d{6}, -?\d+\.\d{6}$/).waitFor();
	await picker.getByText("Near: Jl. Contoh 1, Jakarta").waitFor();
	await picker.getByText(/^-?\d+\.\d{5}, -?\d+\.\d{5} \(50 m\)$/).waitFor();
	ok(
		true,
		"tapping the map drops a pin, shows the nearest address, and fills in the form",
	);
	await page.getByRole("button", { name: "Add checkpoint" }).click();
	await page
		.getByRole("dialog")
		.waitFor({ state: "detached", timeout: 15000 });
	await text('"Pos belakang" added and selected for printing.');
	ok(true, "the dialog closes once the checkpoint is added");
	await text("1 of 9 selected");
	await page.locator(".qr-panel .qr-sticker").first().waitFor();
	ok(
		(await page.locator(".qr-panel .qr-sticker").count()) === 1,
		"new checkpoint added, pre-selected, and its QR shown for printing",
	);
	await page.getByLabel("Select all", { exact: true }).check();
	await text("9 of 9 selected");
	ok(
		await page.getByRole("button", { name: "Print selected" }).isEnabled(),
		"select all enables Print selected",
	);
	const [pdf] = await Promise.all([
		page.waitForEvent("download"),
		page.getByRole("button", { name: "Download as PDF" }).click(),
	]);
	const pdfBytes = readFileSync(await pdf.path());
	ok(
		pdf.suggestedFilename() === "patroli-checkpoints.pdf" &&
			pdfBytes.subarray(0, 5).toString() === "%PDF-",
		"Download as PDF saves a PDF sticker sheet",
		`${pdf.suggestedFilename()}, ${pdfBytes.length} bytes`,
	);

	const lastRow = route.locator("tbody tr").last();
	await lastRow.getByRole("button", { name: "Rename" }).click();
	await lastRow.getByRole("textbox").fill("Pos belakang gudang");
	await lastRow.getByRole("button", { name: "Save" }).click();
	// exact: the row's other cells hold buttons labelled e.g. "Rename: Pos belakang gudang".
	await route
		.getByRole("cell", { name: "Pos belakang gudang", exact: true })
		.waitFor({ timeout: 15000 });
	ok(true, "checkpoint renamed from the round table");

	// Icon-only buttons: every one has a name for screen readers and help text on hover.
	const unlabelled = await page
		.locator(".icon-btn")
		.evaluateAll(
			(els) =>
				els.filter(
					(el) => !el.getAttribute("aria-label") || !el.dataset.tip,
				).length,
		);
	ok(
		unlabelled === 0,
		"every icon button has a label and help text",
		`${unlabelled} without`,
	);
	await route
		.locator("tbody tr")
		.nth(1)
		.getByRole("button", { name: /^Rename/ })
		.hover();
	await page
		.locator(".tooltip:not([hidden])")
		.getByText("Rename", { exact: true })
		.waitFor({ timeout: 5000 });
	ok(true, "hovering an icon button shows what it does");
	// Onto a plain element, in steps like a real mouse (one jump, or a jump to the window's corner,
	// can skip the events the tooltip listens for).
	const heading = page.getByRole("heading", { name: "Round order" });
	await heading.scrollIntoViewIfNeeded();
	const box = await heading.boundingBox();
	await page.mouse.move(box.x + 5, box.y + box.height / 2, { steps: 8 });
	await page.locator(".tooltip").waitFor({ state: "hidden", timeout: 5000 });
	ok(true, "and the help text goes away when the mouse leaves");

	acceptNextDialog();
	await route
		.locator("tbody tr")
		.first()
		.getByRole("button", { name: "Replace sticker" })
		.click();
	await text(`New sticker for "${names[0].trim()}" is ready`);
	// The table reloads just after the message appears.
	const firstCode = route.locator("tbody tr").first().locator("td.c-code");
	await page.waitForFunction(
		([el, old]) => el.textContent.trim() !== old,
		[await firstCode.elementHandle(), codes[0].trim()],
		{ timeout: 15000 },
	);
	ok(true, "replacing a sticker issues a new code");
	const newFirstCode = (await firstCode.textContent()).trim();
	const lastRowLocation = route
		.locator("tbody tr")
		.last()
		.locator("td.c-loc");
	ok(
		/-?\d+\.\d{5}, -?\d+\.\d{5} \(50 m\)/.test(
			await lastRowLocation.textContent(),
		),
		"a checkpoint added with a location keeps it",
	);

	const firstRow = route.locator("tbody tr").first();
	await firstRow.getByRole("button", { name: /^Edit location/ }).click();
	await picker.getByRole("searchbox").fill("Jl Contoh");
	// A modal dialog is drawn above the page, so a tip left on the page would sit behind it.
	await picker.getByRole("button", { name: "Search", exact: true }).hover();
	await picker
		.locator(".tooltip:not([hidden])")
		.getByText("Search this address")
		.waitFor({ timeout: 5000 });
	ok(true, "help text inside a dialog shows on top of it");
	await picker.getByRole("button", { name: "Search", exact: true }).click();
	await picker.getByRole("button", { name: "Jl. Contoh 1, Jakarta" }).click();
	await picker.getByText("-6.200000, 106.800000").waitFor();
	await picker.getByLabel("Radius (metres)").fill("60");
	await picker.getByRole("button", { name: "Save" }).click();
	await firstRow
		.getByText("-6.20000, 106.80000 (60 m)")
		.waitFor({ timeout: 15000 });
	ok(true, "a pin moved by searching an address");

	const secondRow = route.locator("tbody tr").nth(1);
	await secondRow.getByRole("button", { name: /^Edit location/ }).click();
	await picker.getByLabel("Coordinates").fill("-6.21, 106.81");
	await picker.getByRole("button", { name: "Go" }).click();
	await picker.getByText("-6.210000, 106.810000").waitFor();
	await picker.getByRole("button", { name: "Save" }).click();
	await secondRow
		.getByText("-6.21000, 106.81000 (50 m)")
		.waitFor({ timeout: 15000 });
	ok(true, "a pin moved by pasting coordinates");
	await firstRow.getByRole("button", { name: /^Edit location/ }).click();
	await picker.getByRole("button", { name: "Save" }).waitFor();
	ok(
		(await picker
			.getByRole("button", { name: "Remove location" })
			.count()) === 0,
		"a location can be moved but not removed",
	);
	await picker.getByRole("button", { name: "Cancel" }).click();

	section("accounts");
	await page.getByRole("link", { name: "Accounts" }).click();
	await page
		.getByText("+62 811-0000-0002")
		.first()
		.waitFor({ timeout: 15000 });
	ok(true, "account list shows phone numbers");
	// Unique per run. Typed in local format; shown as +62 812-....
	const tail = String(Date.now()).slice(-8);
	const typedPhone = `0812-${tail.slice(0, 4)}-${tail.slice(4)}`;
	const shownPhone = `+62 812-${tail.slice(0, 4)}-${tail.slice(4)}`;
	const addPanel = page.locator("section", {
		has: page.getByRole("heading", { name: "Add one account" }),
	});
	// Input rules: examples shown, digits dropped from names, Indonesian numbers need 10-13 digits.
	await addPanel.getByPlaceholder("e.g. Budi Santoso").waitFor();
	await addPanel.getByPlaceholder("e.g. 0812-3456-7890").waitFor();
	await addPanel.getByLabel("Full name").fill("Budi 007");
	ok(
		(await addPanel.getByLabel("Full name").inputValue()) === "Budi ",
		"the name field drops digits as they're typed",
	);
	await addPanel.getByLabel("Full name").fill("");
	await addPanel.getByLabel("Phone number").fill("0812-345-67");
	await addPanel.getByRole("button", { name: "Add account" }).click();
	await addPanel.getByText("Enter the full name.").waitFor();
	await addPanel.getByText("Indonesian mobiles start with 08").waitFor();
	ok(true, "an empty name and a too-short number are refused");
	await page.locator('input[type="file"]').setInputFiles({
		name: "guards.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(
			"full_name,phone\nDewi Lestari,0812-1111-2222\nAgent 47,0812-1111-3333\n",
		),
	});
	await text("name must be letters only, up to 70 characters");
	ok(true, "the CSV import skips a row whose name has digits");
	await page.getByRole("button", { name: "Cancel" }).click();

	await addPanel.getByLabel("Full name").fill("Siti Rahma");
	await addPanel.getByLabel("Phone number").fill(typedPhone);
	await addPanel.getByRole("button", { name: "Add account" }).click();
	await text("These passwords are shown only once");
	const firstPassword = (
		await page.locator("td.font-mono").first().textContent()
	).trim();
	ok(
		/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(firstPassword),
		"one-time password shown",
	);

	await addPanel.getByText(shownPhone).waitFor();
	ok(true, "the typed number is shown in one standard form");

	const sitiRow = page.locator("tr", {
		has: page.getByText(shownPhone),
	});
	acceptNextDialog();
	await sitiRow.getByRole("button", { name: "New password" }).click();
	await text("New password for Siti Rahma:");
	const password = (
		await page.locator(".notice span.font-mono").first().textContent()
	).trim();
	ok(password !== firstPassword, "password reset shows a new password");

	// One-time codes aren't built yet (TODO): the option and the button are shown but disabled.
	ok(
		await addPanel
			.getByLabel("Send a one-time code to confirm this number")
			.isDisabled(),
		"the one-time code option is shown but disabled",
	);
	ok(
		await sitiRow
			.getByRole("button", { name: "Confirm number: Siti Rahma" })
			.isDisabled(),
		"the Confirm number button is shown but disabled",
	);

	// Siti gets a new number; from now on she signs in with it.
	const newTail = String(Number(tail) + 1).padStart(8, "0");
	const newShown = `+62 813-${newTail.slice(0, 4)}-${newTail.slice(4)}`;
	await sitiRow
		.getByRole("button", { name: "Change phone number: Siti Rahma" })
		.click();
	await page
		.getByLabel("Phone number", { exact: true })
		.last()
		.fill(`0813${newTail}`);
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await text(`Saved. Siti Rahma now signs in with ${newShown}.`);
	ok(true, "a supervisor changes a number");
	await signOut();

	section("guard round");
	await signIn(typedPhone, password);
	await text("Phone number or password is incorrect");
	ok(true, "the old number no longer works");
	await signIn(newShown, firstPassword);
	await text("Phone number or password is incorrect");
	ok(true, "old password no longer works");
	await signIn(newShown, password);
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
	await page.getByLabel("From gallery").setInputFiles({
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
	await page.getByRole("link", { name: "Back to checkpoint list" }).click();
	await text("1 of 9 checkpoints checked today");
	ok(true, "report with photo sent, round progress updates");
	ok(
		(await page.locator(".route li.is-done svg").count()) === 1,
		"a checked stop shows a check mark",
	);

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

	section("location");
	await context.setGeolocation({
		latitude: -6.2,
		longitude: 106.8,
		accuracy: 10,
	});
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
	await text("Location found (±10 m)");
	ok(true, "the scan screen shows the GPS fix");
	await page.getByLabel("Code under the QR sticker").fill(newFirstCode);
	await page.getByRole("button", { name: "Log scan" }).click();
	await text("Logged", { exact: true });
	ok(
		!(await page.getByText("flagged for your supervisor").isVisible()),
		"a scan at the pinned spot isn't flagged",
	);
	await page.getByRole("link", { name: "Back to checkpoint list" }).click();

	await context.setGeolocation({
		latitude: -6.26,
		longitude: 106.81,
		accuracy: 10,
	});
	await page.getByRole("link", { name: "Scan checkpoint" }).click();
	await text("Location found (±10 m)");
	await page.getByLabel("Code under the QR sticker").fill(codes[1].trim());
	await page.getByRole("button", { name: "Log scan" }).click();
	await text("flagged for your supervisor");
	ok(true, "a scan 5 km from its checkpoint is flagged on the phone");
	await page.getByRole("link", { name: "Back to checkpoint list" }).click();
	await signOut();

	section("supervisor sees it");
	await signIn(SEED.supervisor, SEED.password);
	await page.waitForURL(/#\/supervisor$/);
	const doneCard = page.locator("section.area-done");
	await doneCard.locator("tbody tr").first().waitFor({ timeout: 15000 });
	const doneRows = await doneCard.locator("tbody tr").count();
	const missedRows = await page
		.locator("section.area-missed tbody tr")
		.count();
	ok(
		doneRows > 0 &&
			(await doneCard
				.getByText(`${doneRows} of ${doneRows + missedRows}`)
				.count()) === 1,
		"Today moves scanned checkpoints to Completed, with the count",
		`${doneRows} completed, ${missedRows} not yet`,
	);
	const farRow = page
		.locator("section.area-review tbody tr")
		.filter({ hasText: "Scan is too far" });
	await farRow.first().waitFor();
	ok(
		/[\d.,]+ km/.test(await farRow.first().textContent()),
		"Needs review lists the far scan, with the distance",
	);
	ok(
		(await page
			.locator("section.area-duty tr", { hasText: "Siti Rahma" })
			.getByText("Patrolling")
			.count()) === 1,
		"the guard who just scanned is patrolling",
	);
	await farRow.first().getByRole("link").click();
	await page.waitForURL(/#\/supervisor\/scans\//);
	ok(true, "a Needs review row opens its scan");
	await page.goBack();
	await page.getByRole("link", { name: "Log Database" }).click();
	await text("At checkpoint");
	await page
		.getByText(/^[\d.,]+ (m|km) away$/)
		.first()
		.waitFor({ timeout: 15000 });
	ok(true, "the log shows at-checkpoint and far scans");

	section("map");
	await page.getByRole("link", { name: "Map", exact: true }).click();
	const map = page.locator(".overview-map");
	await map.locator(".map-pin").first().waitFor({ timeout: 20000 });
	ok(
		(await map.locator(".map-pin").count()) === 9,
		"all 9 checkpoints are on the map",
	);
	ok(
		(await map.locator(".map-pin.is-visited").count()) === 3,
		"the 3 visited ones are green",
	);
	await text("Scans on the map: 4");
	ok(
		(await map.locator("path.map-scan.is-ok").count()) === 3 &&
			(await map.locator("path.map-scan.is-far").count()) === 1 &&
			(await map.locator("path.map-scan.is-unknown").count()) === 0,
		"scans are drawn at-checkpoint and far",
	);
	ok(
		(await page.getByText("Checkpoints without a location").count()) === 0,
		"no checkpoint is left off the map for want of a location",
	);
	await map.locator('.map-pin[title="Pos belakang gudang"]').click();
	await map
		.locator(".leaflet-popup-content")
		.getByText("Not visited that day")
		.waitFor();
	ok(true, "a checkpoint's popup says whether it was visited");
	await page.getByLabel("Guard").selectOption({ label: "Siti Rahma" });
	// "attached": at the zoom that fits every pin, a route of a few km is under a pixel wide.
	await map
		.locator("path.map-path")
		.waitFor({ state: "attached", timeout: 15000 });
	ok(true, "choosing one guard draws their route");
	await page.getByRole("link", { name: "Log Database" }).click();
	await page
		.locator(".log-scans tbody tr", { hasText: "Has a report" })
		.first()
		.getByRole("link")
		.click();
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

	section("remove checkpoints");
	await page.getByRole("link", { name: "Checkpoints and QR" }).click();
	const round = page.locator("section", {
		has: page.getByRole("heading", { name: "Round order" }),
	});
	await round.locator("tbody tr").first().waitFor({ timeout: 20000 });
	const before = await round.locator("tbody tr").count();
	await round
		.getByRole("checkbox", { name: "Select: Atap dan tandon air" })
		.check();
	await round
		.getByRole("checkbox", { name: "Select: Pos jaga gerbang" })
		.check();
	await page.getByText(`2 of ${before} selected`).first().waitFor();
	ok(
		await page.getByRole("button", { name: "Print selected" }).isEnabled(),
		"selected rows are ready to print",
	);
	page.once("dialog", (d) => void d.accept());
	await round.getByRole("button", { name: "Remove selected (2)" }).click();
	await page.getByText("Checkpoints removed: 2.").waitFor({ timeout: 15000 });
	await page.waitForFunction(
		(n) =>
			[...document.querySelectorAll("section")].some(
				(s) =>
					s.querySelector("h2")?.textContent === "Round order" &&
					s.querySelectorAll("tbody tr").length === n,
			),
		before - 2,
		{ timeout: 15000 },
	);
	ok(
		!(await round.getByText("Atap dan tandon air").isVisible()) &&
			!(await round.getByText("Pos jaga gerbang").isVisible()),
		"two selected checkpoints removed",
	);

	await page.getByRole("link", { name: "Accounts" }).click();
	const row = page.locator("tr", {
		has: page.getByText(newShown),
	});
	acceptNextDialog();
	await row.getByRole("button", { name: "Deactivate" }).click();
	await row
		.getByRole("cell", { name: "Deactivated", exact: true })
		.waitFor({ timeout: 15000 });
	await signOut();
	await signIn(newShown, password);
	await text("Phone number or password is incorrect");
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
	`${unexpected.join(" | ")} || failed requests: ${failedRequests.join(", ")}`,
);
await browser.close();
stopVite();
done();
