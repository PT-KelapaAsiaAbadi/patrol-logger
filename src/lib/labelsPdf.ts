/**
 * The sticker sheet as a PDF, laid out like the printed one (labelsDocument, lib/labels.ts): A4,
 * 12 mm margins, two columns of dashed cut-out labels, each with the QR code, the checkpoint name
 * and its text code. Loaded only when a supervisor downloads it (it brings in pdf-lib), and kept
 * out of the guard app's offline cache (vite.config.ts).
 */
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { Checkpoint } from "../types";

const MM = 72 / 25.4; // PDF points per millimetre
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 12 * MM;
const GAP = 6 * MM;
const PAD = 5 * MM;
const QR = 55 * MM;
const NAME_SIZE = 13;
const NAME_LINE = NAME_SIZE * 1.2;
const CODE_SIZE = 16;
const CODE_SPACING = 1.5; // between the code's letters, like the sheet's letter-spacing
const INK = rgb(0.067, 0.094, 0.125);
const CUT_LINE = rgb(0.53, 0.53, 0.53);

const COL_W = (PAGE_W - 2 * MARGIN - GAP) / 2;
// Three rows to a page, like the printed sheet: about 87 mm per label, room for the QR, up to two
// lines of name and the code.
const ROWS = 3;
const LABEL_H = (PAGE_H - 2 * MARGIN - (ROWS - 1) * GAP) / ROWS;
const PER_PAGE = ROWS * 2;

/**
 * The standard PDF fonts only cover Western European letters. Accents that aren't covered are
 * dropped ("ş" -> "s"), and any other character becomes "?", so a name never breaks the download.
 */
function printable(text: string, font: PDFFont): string {
	const covered = new Set(font.getCharacterSet());
	return [...text]
		.map((ch) => {
			if (covered.has(ch.codePointAt(0)!)) return ch;
			const plain = ch.normalize("NFD").replace(/\p{M}/gu, "");
			return [...plain].every((c) => covered.has(c.codePointAt(0)!))
				? plain
				: "?";
		})
		.join("");
}

/** Splits a name into at most two lines that fit the label, ending with "…" if it's cut short. */
function wrapName(text: string, font: PDFFont, width: number): string[] {
	const fits = (s: string) => font.widthOfTextAtSize(s, NAME_SIZE) <= width;
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(" ")) {
		const next = line ? `${line} ${word}` : word;
		if (fits(next) || !line) line = next;
		else {
			lines.push(line);
			line = word;
		}
	}
	lines.push(line);
	if (lines.length <= 2) return lines;
	let last = `${lines[1]} ${lines.slice(2).join(" ")}`;
	while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
	return [lines[0], `${last.trimEnd()}…`];
}

/** Builds the PDF: six labels to a page, in the order given. */
export async function labelsPdf(
	items: { cp: Checkpoint; img: string }[],
): Promise<Uint8Array<ArrayBuffer>> {
	const doc = await PDFDocument.create();
	doc.setTitle("Label titik patroli");
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const regular = await doc.embedFont(StandardFonts.Helvetica);

	let page = doc.addPage([PAGE_W, PAGE_H]);
	for (const [i, { cp, img }] of items.entries()) {
		if (i > 0 && i % PER_PAGE === 0) page = doc.addPage([PAGE_W, PAGE_H]);
		const slot = i % PER_PAGE;
		const x = MARGIN + (slot % 2) * (COL_W + GAP);
		const top = PAGE_H - MARGIN - Math.floor(slot / 2) * (LABEL_H + GAP);
		const bottom = top - LABEL_H;

		page.drawRectangle({
			x,
			y: bottom,
			width: COL_W,
			height: LABEL_H,
			borderColor: CUT_LINE,
			borderWidth: 0.75,
			borderDashArray: [3, 3],
		});

		const qr = await doc.embedPng(img);
		page.drawImage(qr, {
			x: x + (COL_W - QR) / 2,
			y: top - PAD - QR,
			width: QR,
			height: QR,
		});

		let y = top - PAD - QR - 2.5 * MM - NAME_SIZE;
		for (const line of wrapName(
			printable(cp.name, bold),
			bold,
			COL_W - 2 * PAD,
		)) {
			const w = bold.widthOfTextAtSize(line, NAME_SIZE);
			page.drawText(line, {
				x: x + (COL_W - w) / 2,
				y,
				size: NAME_SIZE,
				font: bold,
				color: INK,
			});
			y -= NAME_LINE;
		}

		// The code sits at the bottom of the label, letter by letter to space it out.
		const code = [...printable(cp.manualCode, regular)];
		const widths = code.map((c) => regular.widthOfTextAtSize(c, CODE_SIZE));
		const total =
			widths.reduce((a, b) => a + b, 0) +
			CODE_SPACING * (code.length - 1);
		let cx = x + (COL_W - total) / 2;
		for (const [j, c] of code.entries()) {
			page.drawText(c, {
				x: cx,
				y: bottom + PAD + 3,
				size: CODE_SIZE,
				font: regular,
				color: INK,
			});
			cx += widths[j] + CODE_SPACING;
		}
	}
	// A plain copy: pdf-lib's bytes may sit on a shared buffer, which a Blob won't take.
	return new Uint8Array(await doc.save());
}
