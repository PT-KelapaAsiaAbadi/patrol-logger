/**
 * The Checkpoints tab: add a checkpoint, manage the round (RouteTable), and print or download
 * QR sticker sheets for the selected checkpoints. Selecting a checkpoint shows its QR code in a
 * panel: beside the table on a wide screen, below it otherwise (index.css, "Checkpoints page").
 */
import { useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { labelsDocument, qrImage } from "../../lib/labels";
import { saveFile } from "../../lib/download";
import { printDocument } from "../../lib/print";
import type { Checkpoint, CheckpointLocation } from "../../types";
import { LocationPicker } from "../../components/LocationPicker";
import {
	CHECKPOINT_NAME_MAX,
	CHECKPOINT_NAME_MIN,
	checkpointNameProblem,
	tidyCheckpointName,
} from "../../lib/checkpointName";
import { formatLocation } from "./RouteTable";
import { LoadError } from "./Log";
import { RouteTable } from "./RouteTable";
import { ICON } from "../../components/IconButton";
import {
	Download,
	MapPinPen,
	MapPinPlus,
	Plus,
	Printer,
	QrCode,
} from "lucide-preact";

export function Checkpoints() {
	const { t } = useApp();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [saved, setSaved] = useState(false);
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
	const showPanel = chosen.length + notPrinted > 0;

	function select(next: Set<string>) {
		setSelected(next);
		setSaved(false);
	}

	function download() {
		saveFile(
			"label-titik-patroli.html",
			labelsDocument(chosen),
			"text/html",
		);
		setSaved(true);
	}

	return (
		<div class="cp-page">
			<header class="cp-head">
				<h1 class="dash-title">{t("navCheckpoints")}</h1>
				<p class="text-muted max-w-prose">{t("qrIntro")}</p>
			</header>

			<AddCheckpoint
				existing={all.map(({ cp }) => cp)}
				onAdded={(cp) => {
					select(new Set(selected).add(cp.id)); // ready to print straight away
					labels.reload();
				}}
			/>

			{labels.error && <LoadError onRetry={labels.reload} />}
			{labels.loading && !labels.data && (
				<p class="text-muted">{t("loading")}</p>
			)}
			{labels.data &&
				(all.length === 0 ? (
					<p class="text-muted">{t("noCheckpoints")}</p>
				) : (
					<div class={`cp-layout ${showPanel ? "has-panel" : ""}`}>
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
						/>

						{showPanel && (
							<aside
								class={`qr-panel ${labels.loading ? "opacity-60 transition-opacity" : ""}`}
								aria-labelledby="qr-h">
								<h2
									id="qr-h"
									class="cp-section-title">
									<QrCode
										size={20}
										aria-hidden="true"
									/>
									{t("printTitle")}
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
												<p class="qr-name">{cp.name}</p>
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
								<div class="qr-actions">
									<button
										type="button"
										class="btn btn-primary"
										disabled={chosen.length === 0}
										onClick={() =>
											printDocument(
												labelsDocument(chosen),
											)
										}>
										<Printer
											size={ICON}
											aria-hidden="true"
										/>
										{t("printSelected", {
											n: chosen.length,
										})}
									</button>
									<button
										type="button"
										class="btn btn-quiet"
										disabled={chosen.length === 0}
										onClick={download}>
										<Download
											size={ICON}
											aria-hidden="true"
										/>
										{t("downloadLabels")}
									</button>
									{saved && (
										<span
											class="text-muted"
											role="status">
											{t("downloaded")}
										</span>
									)}
								</div>
							</aside>
						)}
					</div>
				))}
		</div>
	);
}

/**
 * Adds a checkpoint. A name and a map location are both required: the location is what scans are
 * checked against, so a checkpoint without one can't flag a guard who scanned from elsewhere.
 */
function AddCheckpoint({
	existing,
	onAdded,
}: {
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

	return (
		<section
			class="cp-card cp-add"
			aria-labelledby="add-cp-h">
			<h2
				id="add-cp-h"
				class="cp-section-title">
				<MapPinPlus
					size={20}
					aria-hidden="true"
				/>
				{t("addCheckpointTitle")}
			</h2>
			{/* noValidate: the app shows its own messages (in the chosen language) instead of the
			    browser's. maxLength still stops typing at the limit. */}
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
							: t("locationNotSet")}
					</span>
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

				{outcome?.kind === "added" && (
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

				{/* Last in the card, after everything it depends on. */}
				<button
					class="btn btn-primary justify-self-start"
					disabled={busy}>
					<Plus
						size={ICON}
						aria-hidden="true"
					/>
					{busy ? t("saving") : t("addCheckpoint")}
				</button>
			</form>
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
