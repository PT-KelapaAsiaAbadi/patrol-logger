/**
 * CSV in and out: the scan-log download, reading a list of guards to import (name and phone
 * number, with per-row problems), and the one-time passwords file for newly created guards.
 */
import type { CreatedGuard, NewGuard, ScanRow } from "../types";
import { formatPhone, normalizePhone } from "./phone";
import { personNameProblem, tidyPersonName } from "./personName";

const cell = (v: string) =>
	/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export function scansToCsv(rows: ScanRow[]): string {
	const header = [
		"scanned_at",
		"received_at",
		"guard",
		"checkpoint",
		"report_note",
		"report_photos",
		"location_status",
		"distance_m",
		"latitude",
		"longitude",
		"accuracy_m",
	];
	const lines = rows.map((r) =>
		[
			r.scannedAt,
			r.receivedAt,
			r.guardName,
			r.checkpointName,
			r.report?.note ?? "",
			String(r.report?.photos.length ?? 0),
			r.locationStatus,
			r.distanceM === null ? "" : String(r.distanceM),
			r.location ? String(r.location.lat) : "",
			r.location ? String(r.location.lng) : "",
			r.location ? String(Math.round(r.location.accuracyM)) : "",
		]
			.map(cell)
			.join(","),
	);
	// BOM so Excel opens UTF-8 names correctly
	return "\uFEFF" + [header.join(","), ...lines].join("\n");
}

// ---------- guard import ----------

// The dashes keep Excel from reading the number as a number and dropping its leading 0.
export const GUARDS_CSV_TEMPLATE =
	"\uFEFFfull_name,phone\nBudi Santoso,0812-3456-7890\n";

export type CsvProblemReason =
	"missing_name" | "invalid_name" | "invalid_phone" | "duplicate_phone";

export interface GuardsCsv {
	guards: NewGuard[];
	problems: { line: number; reason: CsvProblemReason }[];
}

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes, CRLF and a BOM. */
function parseRows(text: string, sep: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c !== '"') field += c;
			else if (text[i + 1] === '"') {
				field += '"';
				i++;
			} else quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === sep) {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/**
 * Reads a guard list: full name and phone number per row, in that order unless a header row
 * says otherwise. Accepts commas or semicolons (Excel uses ";" in Indonesian locales), and
 * numbers in any common format. Bad rows are reported, not thrown, so the supervisor can fix
 * just those.
 */
export function parseGuardsCsv(text: string): GuardsCsv {
	const body = text.replace(/^\uFEFF/, "");
	const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
	const sep =
		firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

	const rows = parseRows(body, sep)
		.map((cells, i) => ({ line: i + 1, cells: cells.map((c) => c.trim()) }))
		.filter((r) => r.cells.some(Boolean));

	let nameCol = 0;
	let phoneCol = 1;
	const head = rows[0]?.cells;
	// Header words people use for the number, in English and Indonesian ("nomor HP", "no WA").
	const isPhoneHeader = (c: string) =>
		/phone|telepon|telp|\bhp\b|nomor|\bwa\b|whatsapp/i.test(c);
	const isNumber = (c: string) => normalizePhone(c) !== null;
	if (head && !head.some(isNumber) && head.some(isPhoneHeader)) {
		phoneCol = head.findIndex(isPhoneHeader);
		const n = head.findIndex((c) => /name|nama/i.test(c));
		nameCol = n >= 0 ? n : phoneCol === 0 ? 1 : 0;
		rows.shift();
	}

	const guards: NewGuard[] = [];
	const problems: GuardsCsv["problems"] = [];
	const seen = new Set<string>();
	for (const { line, cells } of rows) {
		const name = tidyPersonName(cells[nameCol] ?? "");
		const phone = normalizePhone(cells[phoneCol] ?? "");
		const nameProblem = personNameProblem(name);
		if (nameProblem === "personNameEmpty")
			problems.push({ line, reason: "missing_name" });
		else if (nameProblem) problems.push({ line, reason: "invalid_name" });
		else if (!phone) problems.push({ line, reason: "invalid_phone" });
		else if (seen.has(phone))
			problems.push({ line, reason: "duplicate_phone" });
		else {
			seen.add(phone);
			guards.push({ name, phone });
		}
	}
	return { guards, problems };
}

/** New guards and their one-time passwords, for the supervisor to print or share. */
export function passwordsToCsv(created: CreatedGuard[]): string {
	const lines = created.map(({ user, password }) =>
		[user.name, user.phone ? formatPhone(user.phone) : "", password]
			.map(cell)
			.join(","),
	);
	return "\uFEFF" + ["full_name,phone,password", ...lines].join("\n");
}
