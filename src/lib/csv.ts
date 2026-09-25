import type { CreatedGuard, NewGuard, ScanRow } from "../types";

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
	];
	const lines = rows.map((r) =>
		[
			r.scannedAt,
			r.receivedAt,
			r.guardName,
			r.checkpointName,
			r.report?.note ?? "",
			String(r.report?.photos.length ?? 0),
		]
			.map(cell)
			.join(","),
	);
	// BOM so Excel opens UTF-8 names correctly
	return "\uFEFF" + [header.join(","), ...lines].join("\n");
}

// ---------- guard import ----------

export const GUARDS_CSV_TEMPLATE =
	"\uFEFFfull_name,email\nBudi Santoso,budi@example.com\n";

export type CsvProblemReason =
	"missing_name" | "invalid_email" | "duplicate_email";

export interface GuardsCsv {
	guards: NewGuard[];
	problems: { line: number; reason: CsvProblemReason }[];
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

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
 * Reads a guard list: full name and email per row, in that order unless a header row
 * says otherwise. Accepts commas or semicolons (Excel uses ";" in Indonesian locales).
 * Bad rows are reported, not thrown, so the supervisor can fix just those.
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
	let emailCol = 1;
	const head = rows[0]?.cells;
	const isEmailHeader = (c: string) => /e-?mail/i.test(c);
	if (head && !head.some(isEmail) && head.some(isEmailHeader)) {
		emailCol = head.findIndex(isEmailHeader);
		const n = head.findIndex((c) => /name|nama/i.test(c));
		nameCol = n >= 0 ? n : emailCol === 0 ? 1 : 0;
		rows.shift();
	}

	const guards: NewGuard[] = [];
	const problems: GuardsCsv["problems"] = [];
	const seen = new Set<string>();
	for (const { line, cells } of rows) {
		const name = (cells[nameCol] ?? "").replace(/\s+/g, " ");
		const email = (cells[emailCol] ?? "").toLowerCase();
		if (!name) problems.push({ line, reason: "missing_name" });
		else if (!isEmail(email))
			problems.push({ line, reason: "invalid_email" });
		else if (seen.has(email))
			problems.push({ line, reason: "duplicate_email" });
		else {
			seen.add(email);
			guards.push({ name, email });
		}
	}
	return { guards, problems };
}

/** New guards and their one-time passwords, for the supervisor to print or share. */
export function passwordsToCsv(created: CreatedGuard[]): string {
	const lines = created.map(({ user, password }) =>
		[user.name, user.email, password].map(cell).join(","),
	);
	return "\uFEFF" + ["full_name,email,password", ...lines].join("\n");
}
