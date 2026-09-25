// Backend checks: Row Level Security, server functions and Edge Functions, as each role sees them.
// Needs a freshly seeded local stack: `npm test` runs `supabase db reset` first.
import { randomUUID } from "node:crypto";
import { localStack, makeClients, reporter, SEED } from "./local-supabase.mjs";

const { anon, admin, signedIn } = makeClients(localStack());
const { ok, section, done } = reporter();
const now = new Date().toISOString();
const PNG_OR_JPEG = Buffer.from(
	"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
	"base64",
);

section("signed out");
{
	const c = anon();
	const { data } = await c.from("checkpoints").select("*");
	ok(!data || data.length === 0, "reads no checkpoints");
	const { error } = await c.rpc("route_checkpoints");
	ok(!!error, "cannot call route_checkpoints");
	const { error: e2 } = await c.auth.signInWithPassword({
		email: SEED.guard,
		password: "wrong-password",
	});
	ok(e2?.status === 400, "wrong password gives 400", e2?.status);
	const { error: e3 } = await c.auth.signUp({
		email: "stranger@example.com",
		password: "stranger-pass-1",
	});
	ok(!!e3, "public sign-up is disabled");
}

const sup = await signedIn(SEED.supervisor);
const guard = await signedIn(SEED.guard);
const supId = (await sup.auth.getUser()).data.user.id;
const guardId = (await guard.auth.getUser()).data.user.id;

section("guard permissions");
const { data: route } = await guard.rpc("route_checkpoints");
{
	ok(route?.length === 8, "gets the 8-stop route", route?.length);
	ok(route && !("manual_code" in route[0]), "route has no manual codes");
	const { data: cps } = await guard.from("checkpoints").select("manual_code");
	ok(cps.length === 0, "cannot read the checkpoints table (manual codes)");
	for (const [fn, args] of [
		["qr_payload", { p_checkpoint_id: route[0].id }],
		["create_checkpoint", { p_name: "Sneaky" }],
		[
			"update_checkpoint",
			{ p_id: route[0].id, p_name: "x", p_active: false },
		],
		["move_checkpoint", { p_id: route[0].id, p_up: false }],
		["reissue_checkpoint", { p_id: route[0].id }],
		["set_account_active", { p_id: supId, p_active: false }],
		["guard_summaries", { p_from: now, p_to: now }],
	]) {
		const { error } = await guard.rpc(fn, args);
		ok(
			error?.message === "not_allowed",
			`cannot call ${fn}`,
			error?.message,
		);
	}
	const { error: e3 } = await guard.from("scans").insert({
		id: randomUUID(),
		checkpoint_id: route[0].id,
		guard_id: guardId,
		scanned_at: now,
	});
	ok(!!e3, "cannot insert scans directly");
	await guard
		.from("profiles")
		.update({ role: "supervisor" })
		.eq("id", guardId);
	const { data: me } = await guard
		.from("profiles")
		.select("role")
		.eq("id", guardId)
		.single();
	ok(me.role === "guard", "cannot promote themselves");
	for (const fn of ["create-guards", "reset-password"]) {
		const { error } = await guard.functions.invoke(fn, {
			body: { guards: [], userId: supId },
		});
		ok(
			error?.context?.status === 403,
			`cannot use ${fn}`,
			error?.context?.status,
		);
	}
}

section("supervisor: checkpoints and QR");
const { data: cps } = await sup
	.from("checkpoints")
	.select("*")
	.order("route_order");
const { data: payload, error: pe } = await sup.rpc("qr_payload", {
	p_checkpoint_id: cps[0].id,
});
{
	ok(
		cps.length === 8 &&
			/^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(cps[0].manual_code),
		"reads checkpoints with manual codes",
	);
	ok(
		!pe &&
			new RegExp(`^PTRL1:${cps[0].id}:[A-Za-z0-9_-]{16}$`).test(payload),
		"QR payload format",
		payload ?? pe?.message,
	);
	const { data: added, error } = await sup.rpc("create_checkpoint", {
		p_name: "  Pintu   belakang  ",
	});
	ok(
		!error && added.route_order === 9 && added.name === "Pintu belakang",
		"create_checkpoint appends and tidies the name",
	);
}

section("scanning");
const scanId = randomUUID();
{
	const { data: r1, error } = await guard.rpc("submit_scan", {
		p_id: scanId,
		p_code: payload,
		p_scanned_at: now,
	});
	ok(
		!error &&
			r1.ok &&
			r1.checkpoint.id === cps[0].id &&
			r1.scan.guard_id === guardId,
		"valid QR accepted",
		JSON.stringify(r1 ?? error),
	);
	ok(r1 && !("manual_code" in r1.checkpoint), "result leaks no manual code");
	const { data: r2 } = await guard.rpc("submit_scan", {
		p_id: scanId,
		p_code: payload,
		p_scanned_at: now,
	});
	ok(
		r2.ok && r2.scan.received_at === r1.scan.received_at,
		"retry returns the first result",
	);
	const forged =
		payload.slice(0, -2) + (payload.endsWith("AA") ? "BB" : "AA");
	const { data: r3 } = await guard.rpc("submit_scan", {
		p_id: randomUUID(),
		p_code: forged,
		p_scanned_at: now,
	});
	ok(
		r3.ok === false && r3.reason === "unknown_code",
		"forged signature rejected",
	);
	const { data: r4, error: e4 } = await guard.rpc("submit_scan", {
		p_id: randomUUID(),
		p_code: "PTRL1:not-a-uuid:xxxx",
		p_scanned_at: now,
	});
	ok(
		!e4 && r4.ok === false && r4.reason === "unknown_code",
		"malformed QR rejected without an error",
	);
	const typed = cps[1].manual_code.replace("-", " ").toLowerCase();
	const { data: r5 } = await guard.rpc("submit_scan", {
		p_id: randomUUID(),
		p_code: typed,
		p_scanned_at: now,
	});
	ok(
		r5.ok && r5.checkpoint.id === cps[1].id,
		`typed code "${typed}" accepted`,
	);
	await admin()
		.from("checkpoints")
		.update({ active: false })
		.eq("id", cps[2].id);
	const { data: r6 } = await guard.rpc("submit_scan", {
		p_id: randomUUID(),
		p_code: cps[2].manual_code,
		p_scanned_at: now,
	});
	ok(
		r6.ok === false && r6.reason === "inactive",
		"inactive checkpoint reported",
	);
	await admin()
		.from("checkpoints")
		.update({ active: true })
		.eq("id", cps[2].id);
	const { error: e7 } = await sup.rpc("submit_scan", {
		p_id: randomUUID(),
		p_code: payload,
		p_scanned_at: now,
	});
	ok(e7?.message === "not_allowed", "supervisors cannot submit scans");
}

section("reports and photos");
{
	const reportId = randomUUID();
	const path = `${guardId}/${reportId}/1.jpg`;
	const bucket = guard.storage.from("report-photos");
	const { error: u1 } = await bucket.upload(path, PNG_OR_JPEG, {
		contentType: "image/jpeg",
	});
	ok(!u1, "guard uploads a photo to their own folder", u1?.message);
	const { error: u2 } = await bucket.upload(path, PNG_OR_JPEG, {
		contentType: "image/jpeg",
	});
	ok(
		!!u2 &&
			(u2.statusCode === "409" || /exists|duplicate/i.test(u2.message)),
		"retried upload reports a duplicate",
	);
	const { error: u3 } = await bucket.upload(
		`${supId}/${reportId}/1.jpg`,
		PNG_OR_JPEG,
		{ contentType: "image/jpeg" },
	);
	ok(!!u3, "guard cannot upload into another folder");
	const report = (id, scan, photos) => ({
		p_id: id,
		p_scan_id: scan,
		p_note: "Pintu tidak terkunci",
		p_photos: photos,
		p_created_at: now,
	});
	const { error: r0 } = await guard.rpc(
		"submit_report",
		report(randomUUID(), randomUUID(), []),
	);
	ok(
		r0?.message === "scan_not_synced",
		"report on an unknown scan: scan_not_synced",
		r0?.message,
	);
	const { error: rb } = await guard.rpc(
		"submit_report",
		report(reportId, scanId, ["someone-else/x.jpg"]),
	);
	ok(
		rb?.message === "bad_photos",
		"foreign photo path rejected",
		rb?.message,
	);
	const { error: r1 } = await guard.rpc(
		"submit_report",
		report(reportId, scanId, [path]),
	);
	const { error: r2 } = await guard.rpc(
		"submit_report",
		report(reportId, scanId, [path]),
	);
	ok(
		!r1 && !r2,
		"report stored, retry is idempotent",
		r1?.message ?? r2?.message,
	);
	const { count } = await admin()
		.from("reports")
		.select("*", { count: "exact", head: true })
		.eq("id", reportId);
	ok(count === 1, "exactly one report row");
	const { data: row } = await sup
		.from("scan_rows")
		.select("*")
		.eq("id", scanId)
		.single();
	ok(
		row.report?.note === "Pintu tidak terkunci" &&
			row.guard_name === "Budi Santoso",
		"supervisor sees the scan with its report",
	);
	const { data: signed } = await sup.storage
		.from("report-photos")
		.createSignedUrls(row.report.photos, 60);
	const img = await fetch(signed[0].signedUrl);
	ok(
		img.ok && img.headers.get("content-type") === "image/jpeg",
		"signed URL serves the photo",
	);
}

section("supervisor summaries and log");
{
	const from = new Date(Date.now() - 3600e3).toISOString();
	const to = new Date(Date.now() + 3600e3).toISOString();
	const { data: sums } = await sup.rpc("guard_summaries", {
		p_from: from,
		p_to: to,
	});
	ok(
		sums?.length === 1 && sums[0].scans_today === 2,
		"guard_summaries counts today's scans",
		JSON.stringify(sums),
	);
	const { data: missed } = await sup.rpc("missed_checkpoints", {
		p_from: from,
		p_to: to,
	});
	ok(
		missed.length === 7 &&
			!missed.some((c) => c.id === cps[0].id || c.id === cps[1].id),
		"missed_checkpoints leaves out visited ones",
	);
	const { data: page, count } = await sup
		.from("scan_rows")
		.select("*", { count: "exact" })
		.order("scanned_at", { ascending: false })
		.order("id")
		.range(0, 0);
	ok(page.length === 1 && count === 2, "paged scan_rows with an exact count");
}

section("checkpoint management");
{
	const { data: renamed, error } = await sup.rpc("update_checkpoint", {
		p_id: cps[3].id,
		p_name: "  Ruang   panel  ",
		p_active: true,
	});
	ok(
		!error && renamed.name === "Ruang panel",
		"rename tidies the name",
		error?.message,
	);
	await sup.rpc("move_checkpoint", { p_id: cps[3].id, p_up: true });
	const { data: after } = await sup
		.from("checkpoints")
		.select("id, route_order")
		.in("id", [cps[2].id, cps[3].id]);
	const order = Object.fromEntries(after.map((c) => [c.id, c.route_order]));
	ok(
		order[cps[3].id] === cps[2].route_order &&
			order[cps[2].id] === cps[3].route_order,
		"move up swaps with the previous stop",
	);
	const { error: firstUp } = await sup.rpc("move_checkpoint", {
		p_id: cps[0].id,
		p_up: true,
	});
	ok(!firstUp, "moving the first stop up is a no-op");

	// Replacing a sticker: old QR and old typed code stop working, new ones work.
	const { data: oldQr } = await sup.rpc("qr_payload", {
		p_checkpoint_id: cps[4].id,
	});
	const { data: reissued, error: re } = await sup.rpc("reissue_checkpoint", {
		p_id: cps[4].id,
	});
	ok(
		!re &&
			reissued.qr_version === 2 &&
			reissued.manual_code !== cps[4].manual_code,
		"reissue bumps the version and the code",
	);
	const { data: newQr } = await sup.rpc("qr_payload", {
		p_checkpoint_id: cps[4].id,
	});
	ok(newQr !== oldQr, "new QR payload differs");
	const scan = async (code) =>
		(
			await guard.rpc("submit_scan", {
				p_id: randomUUID(),
				p_code: code,
				p_scanned_at: now,
			})
		).data;
	ok(
		(await scan(oldQr)).reason === "unknown_code",
		"old QR sticker rejected",
	);
	ok(
		(await scan(cps[4].manual_code)).reason === "unknown_code",
		"old typed code rejected",
	);
	ok((await scan(newQr)).ok === true, "new QR sticker accepted");
	ok(
		(await scan(reissued.manual_code)).ok === true,
		"new typed code accepted",
	);
}

section("accounts: create, reset, deactivate");
{
	const newEmail = `guard${Date.now()}@patroli.test`;
	const supEmail = `sup${Date.now()}@patroli.test`;
	const { data, error } = await sup.functions.invoke("create-guards", {
		body: {
			guards: [
				{ name: "Agus Pratama", email: newEmail },
				{ name: "Rina Dua", email: supEmail, role: "supervisor" },
				{ name: "Dup", email: SEED.guard },
				{ name: "", email: "bad" },
				{
					name: "Wrong role",
					email: `x${Date.now()}@patroli.test`,
					role: "admin",
				},
			],
		},
	});
	ok(
		!error &&
			data.created.length === 2 &&
			data.existing[0] === SEED.guard &&
			data.failed.length === 2,
		"creates new accounts, skips existing, rejects invalid and unknown roles",
		JSON.stringify(data ?? error?.message),
	);
	const created = Object.fromEntries(
		(data?.created ?? []).map((c) => [c.user.email, c]),
	);
	ok(
		created[supEmail]?.user.role === "supervisor",
		"a supervisor can add another supervisor",
	);
	ok(
		/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(
			created[newEmail]?.password ?? "",
		),
		"generated password format",
	);

	const g2 = await signedIn(newEmail, created[newEmail].password);
	const g2Id = (await g2.auth.getUser()).data.user.id;
	const { data: others } = await g2.from("scans").select("*");
	ok(others.length === 0, "new guard cannot see another guard's scans");
	const { error: se } = await g2.rpc("submit_scan", {
		p_id: scanId,
		p_code: payload,
		p_scanned_at: now,
	});
	ok(
		se?.message === "not_allowed",
		"reusing another guard's scan id is refused",
	);

	const { data: reset, error: rpe } = await sup.functions.invoke(
		"reset-password",
		{ body: { userId: g2Id } },
	);
	ok(
		!rpe &&
			/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/.test(reset?.password ?? ""),
		"supervisor resets a password",
		rpe?.message,
	);
	const oldLogin = await signedIn(newEmail, created[newEmail].password).catch(
		(e) => e,
	);
	ok(oldLogin instanceof Error, "old password no longer works");
	const newLogin = await signedIn(newEmail, reset.password).catch((e) => e);
	ok(!(newLogin instanceof Error), "new password works");
	const { error: selfReset } = await sup.functions.invoke("reset-password", {
		body: { userId: supId },
	});
	ok(
		selfReset?.context?.status === 403,
		"supervisors cannot reset their own password here",
	);

	const { error: selfOff } = await sup.rpc("set_account_active", {
		p_id: supId,
		p_active: false,
	});
	ok(
		selfOff?.message === "cannot_change_self",
		"supervisors cannot deactivate themselves",
		selfOff?.message,
	);
	const { error: off } = await sup.rpc("set_account_active", {
		p_id: g2Id,
		p_active: false,
	});
	ok(!off, "supervisor deactivates a guard", off?.message);
	const { error: stillSignedIn } = await g2.rpc("route_checkpoints");
	ok(
		stillSignedIn?.message === "not_allowed",
		"a deactivated guard's open session gets nothing",
	);
	const { data: afterOff } = await (
		await signedIn(newEmail, reset.password)
	)
		.from("profiles")
		.select("active")
		.eq("id", g2Id)
		.single();
	ok(
		afterOff?.active === false,
		"profile shows the account as inactive (the app refuses the sign-in)",
	);
	await sup.rpc("set_account_active", { p_id: g2Id, p_active: true });
	const { error: back } = await g2.rpc("route_checkpoints");
	ok(!back, "reactivating restores access");
}

done();
