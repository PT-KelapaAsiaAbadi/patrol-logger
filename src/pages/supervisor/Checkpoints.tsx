import { useEffect, useRef, useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import { labelsDocument, qrImage } from "../../lib/labels";
import { saveFile } from "../../lib/download";
import { printDocument } from "../../lib/print";
import type { Checkpoint, CheckpointLocation } from "../../types";
import { LocationPicker } from "../../components/LocationPicker";
import { formatLocation } from "./RouteTable";
import { LoadError } from "./Log";
import { RouteTable } from "./RouteTable";

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
	const allChosen = items.length > 0 && chosen.length === items.length;

	const allBox = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (allBox.current)
			allBox.current.indeterminate = chosen.length > 0 && !allChosen;
	});

	function select(next: Set<string>) {
		setSelected(next);
		setSaved(false);
	}

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		select(next);
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
		<>
			<h1 class="text-xl font-bold">{t("navCheckpoints")}</h1>
			<p class="mt-2 max-w-prose text-muted">{t("qrIntro")}</p>

			<AddCheckpoint
				onAdded={(cp) => {
					select(new Set(selected).add(cp.id)); // ready to print straight away
					labels.reload();
				}}
			/>

			{labels.error && (
				<div class="mt-4">
					<LoadError onRetry={labels.reload} />
				</div>
			)}
			{labels.loading && !labels.data && (
				<p class="mt-6 text-muted">{t("loading")}</p>
			)}
			{labels.data &&
				(all.length === 0 ? (
					<p class="mt-6 text-muted">{t("noCheckpoints")}</p>
				) : (
					<>
						<RouteTable
							checkpoints={all.map(({ cp }) => cp)}
							onChanged={(reissued) => {
								// A replaced sticker must be printed straight away.
								if (reissued)
									select(new Set(selected).add(reissued.id));
								labels.reload();
							}}
						/>

						<h2 class="text-lg font-semibold mt-10">
							{t("printTitle")}
						</h2>
						<div class="label-toolbar mt-3">
							<label class="inline-flex items-center gap-2 font-medium">
								<input
									ref={allBox}
									type="checkbox"
									class="size-5"
									checked={allChosen}
									onChange={() =>
										select(
											allChosen
												? new Set()
												: new Set(
														items.map(
															({ cp }) => cp.id,
														),
													),
										)
									}
								/>
								{t("selectAll")}
							</label>
							<span
								class="text-muted tabular-nums"
								aria-live="polite">
								{t("selectedCount", {
									n: chosen.length,
									total: items.length,
								})}
							</span>
							<span class="flex flex-wrap items-center gap-3 sm:ml-auto">
								<button
									type="button"
									class="btn btn-primary"
									disabled={chosen.length === 0}
									onClick={() =>
										printDocument(labelsDocument(chosen))
									}>
									{t("printSelected", { n: chosen.length })}
								</button>
								<button
									type="button"
									class="btn btn-quiet"
									disabled={chosen.length === 0}
									onClick={download}>
									{t("downloadLabels")}
								</button>
								{saved && (
									<span
										class="text-muted"
										role="status">
										{t("downloaded")}
									</span>
								)}
							</span>
						</div>

						<ul
							class={`sticker-grid mt-4 ${labels.loading ? "opacity-60 transition-opacity" : ""}`}>
							{items.map(({ cp, img }) => (
								<li key={cp.id}>
									<label
										class={`sticker ${selected.has(cp.id) ? "is-selected" : ""}`}>
										<input
											type="checkbox"
											class="sticker-check"
											checked={selected.has(cp.id)}
											onChange={() => toggle(cp.id)}
										/>
										<img
											src={img}
											alt={`QR ${cp.name}`}
										/>
										<p class="sticker-name">{cp.name}</p>
										<p class="sticker-code">
											{cp.manualCode}
										</p>
										<p class="sticker-order">
											{t("routeOrder", {
												n: cp.routeOrder,
											})}
										</p>
									</label>
								</li>
							))}
						</ul>
					</>
				))}
		</>
	);
}

function AddCheckpoint({ onAdded }: { onAdded: (cp: Checkpoint) => void }) {
	const { t } = useApp();
	const [name, setName] = useState("");
	const [location, setLocation] = useState<CheckpointLocation | null>(null);
	const [picking, setPicking] = useState(false);
	const [busy, setBusy] = useState(false);
	const [outcome, setOutcome] = useState<
		{ kind: "added"; name: string } | { kind: "error" } | null
	>(null);

	async function submit() {
		setBusy(true);
		setOutcome(null);
		try {
			let cp = await api.createCheckpoint(
				name.trim().replace(/\s+/g, " "),
			);
			if (location) cp = await api.setCheckpointLocation(cp.id, location);
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
			class="panel mt-6 max-w-2xl"
			aria-labelledby="add-cp-h">
			<h2
				id="add-cp-h"
				class="font-semibold mb-3">
				{t("addCheckpointTitle")}
			</h2>
			<form
				class="add-row"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}>
				<label class="grid gap-1">
					<span class="font-medium">{t("checkpointName")}</span>
					<input
						class="field"
						required
						maxLength={80}
						autoComplete="off"
						placeholder={t("checkpointPlaceholder")}
						value={name}
						onInput={(e) => setName(e.currentTarget.value)}
					/>
				</label>
				<button
					class="btn btn-primary"
					disabled={busy}>
					{busy ? t("saving") : t("addCheckpoint")}
				</button>
			</form>
			<p class="text-muted mt-2">{t("checkpointHint")}</p>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
				<span class="font-medium">{t("colLocation")}:</span>
				<span class={location ? "font-mono text-sm" : "text-muted"}>
					{location ? formatLocation(location) : t("locationNotSet")}
				</span>
				<button
					type="button"
					class="link-btn"
					onClick={() => setPicking(true)}>
					{location ? t("editLocation") : t("setLocationOptional")}
				</button>
			</div>
			{picking && (
				<LocationPicker
					name={name.trim() || t("pickerNewCheckpoint")}
					initial={location}
					onSave={setLocation}
					onClose={() => setPicking(false)}
				/>
			)}
			{outcome?.kind === "added" && (
				<p
					class="notice notice-ok mt-3"
					role="status">
					{t("checkpointAdded", { name: outcome.name })}
				</p>
			)}
			{outcome?.kind === "error" && (
				<p
					class="notice notice-warn mt-3"
					role="alert">
					{t("saveError")}
				</p>
			)}
		</section>
	);
}
