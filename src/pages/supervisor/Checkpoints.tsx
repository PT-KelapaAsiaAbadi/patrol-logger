/**
 * The Checkpoints tab: add a checkpoint, manage the round (RouteTable), and print or download (as
 * a PDF) the QR stickers of the selected checkpoints. Their QR codes show in a panel (index.css,
 * "Checkpoints page"):
 *   - desktop: Download as PDF and Print selected sit beside Add checkpoint; from 1280px the panel
 *     is a column beside the table, always there and as tall as it, empty until something is
 *     selected and scrolling when several are
 *   - phones and tablets: the panel appears below the table once something is selected, with its
 *     own Print and Download buttons
 * Adding a checkpoint: on a desktop, a button beside the title opens a wide dialog with the form
 * on the left and the map on the right; on phones and tablets the form is a card on the page and the
 * map opens in its own dialog.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync, useMediaQuery } from "../../hooks";
import * as api from "../../data/api";
import { labelsDocument, qrImage } from "../../lib/labels";
import { saveFile } from "../../lib/download";
import { printDocument } from "../../lib/print";
import type { Checkpoint, CheckpointLocation } from "../../types";
import {
	LocationFields,
	LocationPicker,
} from "../../components/LocationPicker";
import {
	CHECKPOINT_NAME_MAX,
	CHECKPOINT_NAME_MIN,
	checkpointNameProblem,
	tidyCheckpointName,
} from "../../lib/checkpointName";
import { formatLocation } from "./RouteTable";
import { LoadError } from "./Log";
import { RouteTable } from "./RouteTable";
import { ICON, IconButton } from "../../components/IconButton";
import {
	FileDown,
	MapPinPen,
	MapPinPlus,
	Plus,
	Printer,
	QrCode,
	X,
} from "lucide-preact";

export function Checkpoints() {
	const { t } = useApp();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [pdf, setPdf] = useState<"idle" | "busy" | "saved" | "failed">(
		"idle",
	);
	// Same breakpoint as the desktop header (index.css).
	const desktop = useMediaQuery("(min-width: 1024px)");
	// Desktop only: the add-checkpoint dialog is open, and the last checkpoint it added.
	const [adding, setAdding] = useState(false);
	const [addedName, setAddedName] = useState<string | null>(null);
	const addButton = useRef<HTMLButtonElement>(null);
	const wasAdding = useRef(false);
	// Closing the card hands focus back to the button that opened it.
	useEffect(() => {
		if (wasAdding.current && !adding) addButton.current?.focus();
		wasAdding.current = adding;
	}, [adding]);
	const labels = useAsync(async () => {
		const cps = await api.allCheckpoints();
		return Promise.all(
			cps.map(async (cp) => ({
				cp,
				img: await qrImage(await api.qrPayloadFor(cp.id)),
			})),
		);
	}, []);

	const all = labels.data ?? [];
	const items = all.filter(({ cp }) => cp.active); // only checkpoints in use get printed
	const chosen = items.filter(({ cp }) => selected.has(cp.id));
	// Selected but out of use: listed in the panel as not printed.
	const notPrinted = all.filter(
		({ cp }) => !cp.active && selected.has(cp.id),
	).length;
	const anySelected = chosen.length + notPrinted > 0;

	function select(next: Set<string>) {
		setSelected(next);
		setPdf("idle");
	}

	/** The sticker sheet as a PDF. pdf-lib is only downloaded now, the first time it's needed. */
	async function downloadPdf() {
		setPdf("busy");
		try {
			const { labelsPdf } = await import("../../lib/labelsPdf");
			saveFile(
				"label-titik-patroli.pdf",
				await labelsPdf(chosen),
				"application/pdf",
			);
			setPdf("saved");
		} catch {
			setPdf("failed");
		}
	}

	/** Download as PDF, then Print: in the desktop header, or under the QR codes on a phone. */
	const printButtons = (
		<>
			<button
				type="button"
				class="btn btn-outline"
				disabled={chosen.length === 0 || pdf === "busy"}
				onClick={() => void downloadPdf()}>
				<FileDown
					size={ICON}
					aria-hidden="true"
				/>
				{pdf === "busy" ? t("makingPdf") : t("downloadPdf")}
			</button>
			<button
				type="button"
				class={desktop ? "btn btn-outline" : "btn btn-primary"}
				disabled={chosen.length === 0}
				onClick={() => printDocument(labelsDocument(chosen))}>
				<Printer
					size={ICON}
					aria-hidden="true"
				/>
				{desktop
					? t("printSelectedPlain")
					: t("printSelected", { n: chosen.length })}
			</button>
		</>
	);
	const pdfStatus =
		pdf === "saved" ? (
			<span
				class="text-muted"
				role="status">
				{t("downloaded")}
			</span>
		) : pdf === "failed" ? (
			<span
				class="text-warn"
				role="alert">
				{t("pdfFailed")}
			</span>
		) : null;

	return (
		<div class="cp-page">
			<header class="cp-head">
				<div class="grid gap-1 min-w-0">
					<h1 class="dash-title">{t("navCheckpoints")}</h1>
					<p class="text-muted max-w-prose">{t("qrIntro")}</p>
				</div>
				{desktop && (
					<div class="cp-head-actions">
						{pdfStatus}
						{printButtons}
						{/* Hidden while the dialog is open, so one "Add checkpoint" button shows at a time. */}
						{!adding && (
							<button
								ref={addButton}
								type="button"
								class="btn btn-primary"
								aria-haspopup="dialog"
								onClick={() => {
									setAddedName(null);
									setAdding(true);
								}}>
								<Plus
									size={ICON}
									aria-hidden="true"
								/>
								{t("addCheckpoint")}
							</button>
						)}
					</div>
				)}
			</header>

			{desktop && addedName && (
				<p
					class="notice notice-ok"
					role="status">
					{t("checkpointAdded", { name: addedName })}
				</p>
			)}

			{/* One place in the tree for both layouts, so what's typed survives a tablet turning past
			    the desktop breakpoint. */}
			{(!desktop || adding) && (
				<AddCheckpoint
					dialog={desktop}
					onClose={() => setAdding(false)}
					existing={all.map(({ cp }) => cp)}
					onAdded={(cp) => {
						select(new Set(selected).add(cp.id)); // ready to print straight away
						labels.reload();
						if (desktop) {
							setAdding(false);
							setAddedName(cp.name);
						}
					}}
				/>
			)}

			{labels.error && <LoadError onRetry={labels.reload} />}
			{labels.loading && !labels.data && (
				<p class="text-muted">{t("loading")}</p>
			)}
			{labels.data &&
				(all.length === 0 ? (
					<p class="text-muted">{t("noCheckpoints")}</p>
				) : (
					<RouteTable
						checkpoints={all.map(({ cp }) => cp)}
						selected={selected}
						onSelect={select}
						onChanged={(reissued) => {
							// A replaced sticker must be printed straight away.
							if (reissued)
								select(new Set(selected).add(reissued.id));
							labels.reload();
						}}
						// Always there on a desktop (empty until something is selected); on phones only
						// once something is.
						aside={
							(desktop || anySelected) && (
								<aside
									class={`qr-panel ${anySelected ? "" : "is-empty"} ${labels.loading ? "opacity-60 transition-opacity" : ""}`}
									aria-labelledby="qr-h">
									<h2
										id="qr-h"
										class="cp-section-title">
										<QrCode
											size={20}
											aria-hidden="true"
										/>
										{t("qrPanelTitle")}
									</h2>
									{chosen.length > 0 && (
										<ul class="qr-list">
											{chosen.map(({ cp, img }) => (
												<li
													key={cp.id}
													class="qr-sticker">
													<img
														src={img}
														alt={`QR ${cp.name}`}
													/>
													<p class="qr-name">
														{cp.name}
													</p>
													<p class="qr-code">
														{cp.manualCode}
													</p>
													<p class="qr-order">
														{t("routeOrder", {
															n: cp.routeOrder,
														})}
													</p>
												</li>
											))}
										</ul>
									)}
									{notPrinted > 0 && (
										<p class="text-sm text-muted">
											{t("notPrinted", { n: notPrinted })}
										</p>
									)}
									{!desktop && (
										<div class="qr-actions">
											{printButtons}
											{pdfStatus}
										</div>
									)}
								</aside>
							)
						}
					/>
				))}
		</div>
	);
}

/**
 * Adds a checkpoint. A name and a map location are both required: the location is what scans are
 * checked against, so a checkpoint without one can't flag a guard who scanned from elsewhere.
 *   - `dialog` (desktop): a wide dialog, the form on the left and the map on the right; picking a
 *     spot fills in the location straight away. It closes once the checkpoint is added.
 *   - otherwise (phones and tablets): a card on the page; "Set location" opens the map in its own
 *     dialog with Save and Cancel.
 */
function AddCheckpoint({
	dialog,
	onClose,
	existing,
	onAdded,
}: {
	dialog: boolean;
	/** Closes the desktop dialog. */
	onClose: () => void;
	/** The checkpoints already in the round, to catch a repeated name. */
	existing: Checkpoint[];
	onAdded: (cp: Checkpoint) => void;
}) {
	const { t } = useApp();
	const [name, setName] = useState("");
	const [location, setLocation] = useState<CheckpointLocation | null>(null);
	const [picking, setPicking] = useState(false);
	const [busy, setBusy] = useState(false);
	// Problems are only shown after a first submit, so the form doesn't complain while typing.
	const [tried, setTried] = useState(false);
	const [outcome, setOutcome] = useState<
		{ kind: "added"; name: string } | { kind: "error" } | null
	>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const nameField = useRef<HTMLInputElement>(null);

	// The desktop dialog opens modal, with the cursor in the name field.
	useEffect(() => {
		if (!dialog) return;
		dialogRef.current?.showModal();
		nameField.current?.focus();
	}, [dialog]);

	const nameProblem = checkpointNameProblem(name, existing);

	async function submit() {
		setTried(true);
		setOutcome(null);
		if (nameProblem || !location) return;
		setBusy(true);
		try {
			const cp = await api.createCheckpoint(
				tidyCheckpointName(name),
				location,
			);
			setTried(false);
			setName("");
			setLocation(null);
			setOutcome({ kind: "added", name: cp.name });
			onAdded(cp);
		} catch {
			setOutcome({ kind: "error" });
		} finally {
			setBusy(false);
		}
	}

	const title = (
		<h2
			id="add-cp-h"
			class="cp-section-title">
			<MapPinPlus
				size={20}
				aria-hidden="true"
			/>
			{t("addCheckpointTitle")}
		</h2>
	);

	// noValidate: the app shows its own messages (in the chosen language) instead of the browser's.
	// maxLength still stops typing at the limit.
	const form = (
		<form
			class="grid gap-3"
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}>
			<label class="grid gap-1">
				<span class="font-medium">{t("checkpointName")}</span>
				<input
					ref={nameField}
					class="field"
					required
					minLength={CHECKPOINT_NAME_MIN}
					maxLength={CHECKPOINT_NAME_MAX}
					autoComplete="off"
					placeholder={t("checkpointPlaceholder")}
					aria-invalid={tried && !!nameProblem}
					value={name}
					onInput={(e) => setName(e.currentTarget.value)}
				/>
			</label>
			{tried && nameProblem && (
				<p
					class="notice notice-warn"
					role="alert">
					{t(nameProblem, {
						min: CHECKPOINT_NAME_MIN,
						max: CHECKPOINT_NAME_MAX,
					})}
				</p>
			)}

			<div class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<span class="font-medium">{t("colLocation")}:</span>
				<span class={location ? "font-mono text-sm" : "text-muted"}>
					{location
						? formatLocation(location)
						: t(dialog ? "pickOnMap" : "locationNotSet")}
				</span>
				{/* On a desktop the map is already beside the form. */}
				{!dialog && (
					<button
						type="button"
						class="btn btn-quiet"
						onClick={() => setPicking(true)}>
						{location ? (
							<MapPinPen
								size={ICON}
								aria-hidden="true"
							/>
						) : (
							<MapPinPlus
								size={ICON}
								aria-hidden="true"
							/>
						)}
						{location
							? t("editLocation")
							: t("setLocationRequired")}
					</button>
				)}
			</div>
			{tried && !location && (
				<p
					class="notice notice-warn"
					role="alert">
					{t("locationRequired")}
				</p>
			)}

			<ul class="hint-list">
				<li>{t("checkpointHintName")}</li>
				<li>{t("checkpointHintLocation")}</li>
				<li>{t("checkpointHintOrder")}</li>
			</ul>

			{/* The desktop dialog closes on success; the page says so instead. */}
			{!dialog && outcome?.kind === "added" && (
				<p
					class="notice notice-ok"
					role="status">
					{t("checkpointAdded", { name: outcome.name })}
				</p>
			)}
			{outcome?.kind === "error" && (
				<p
					class="notice notice-warn"
					role="alert">
					{t("saveError")}
				</p>
			)}

			{/* Last in the form, after everything it depends on. */}
			<button
				class="btn btn-primary w-full"
				disabled={busy}>
				<Plus
					size={ICON}
					aria-hidden="true"
				/>
				{busy ? t("saving") : t("addCheckpoint")}
			</button>
		</form>
	);

	if (dialog)
		return (
			<dialog
				ref={dialogRef}
				class="add-dialog"
				aria-labelledby="add-cp-h"
				onCancel={(e) => {
					e.preventDefault();
					onClose();
				}}>
				<div class="add-dialog-head">
					{title}
					<IconButton
						icon={X}
						label={t("close")}
						onClick={onClose}
					/>
				</div>
				<div class="add-dialog-body">
					{form}
					<div class="add-dialog-map">
						<p class="text-muted text-sm mb-3">{t("pickerHint")}</p>
						<LocationFields
							initial={location}
							onChange={setLocation}
						/>
					</div>
				</div>
			</dialog>
		);

	return (
		<section
			class="cp-card cp-add"
			aria-labelledby="add-cp-h">
			{title}
			{form}
			{/* Outside the form, so the picker's own buttons can never submit it. */}
			{picking && (
				<LocationPicker
					name={name.trim() || t("pickerNewCheckpoint")}
					initial={location}
					onSave={setLocation}
					onClose={() => setPicking(false)}
				/>
			)}
		</section>
	);
}
