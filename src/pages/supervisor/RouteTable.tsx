/**
 * The checkpoint table on the Checkpoints tab: reorder the round, rename, take in or out of use,
 * replace a sticker, move a location, and select checkpoints to print or remove.
 * A table on desktop; below 1024px each row is laid out as a card (index.css, "Checkpoints page").
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { useApp } from "../../state";
import * as api from "../../data/api";
import type { Checkpoint, CheckpointLocation } from "../../types";
import { LocationPicker } from "../../components/LocationPicker";
import {
	CHECKPOINT_NAME_MAX,
	CHECKPOINT_NAME_MIN,
	checkpointNameProblem,
	tidyCheckpointName,
	type CheckpointNameProblem,
} from "../../lib/checkpointName";
import { ICON, IconButton } from "../../components/IconButton";
import {
	Check,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	MapPinPen,
	MapPinPlus,
	Pencil,
	RefreshCw,
	Trash2,
	X,
} from "lucide-preact";

export const formatLocation = (l: CheckpointLocation) =>
	`${l.lat.toFixed(5)}, ${l.lng.toFixed(5)} (${l.radiusM} m)`;

type Notice =
	| { kind: "reissued"; name: string }
	| { kind: "removed"; n: number }
	| { kind: "error" }
	| null;

/**
 * The round as supervisors manage it: order, rename, take in or out of use, replace a sticker.
 * `onChanged` gets the checkpoint whose sticker was replaced, so the page can select it for printing.
 */
export function RouteTable({
	checkpoints,
	selected,
	onSelect,
	onChanged,
}: {
	checkpoints: Checkpoint[];
	/** Shared with the QR panel: pick checkpoints once, then print or remove them. */
	selected: Set<string>;
	onSelect: (next: Set<string>) => void;
	onChanged: (reissued?: Checkpoint) => void;
}) {
	const { t } = useApp();
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<{
		id: string;
		name: string;
		/** Set when a save was refused by the name rules (lib/checkpointName.ts). */
		problem?: CheckpointNameProblem;
	} | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const chosen = checkpoints.filter((cp) => selected.has(cp.id));
	const allChosen =
		checkpoints.length > 0 && chosen.length === checkpoints.length;
	const allBox = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (allBox.current)
			allBox.current.indeterminate = chosen.length > 0 && !allChosen;
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		onSelect(next);
	}

	function removeChosen() {
		const names = chosen.map((cp) => cp.name).join(", ");
		if (!confirm(t("removeConfirm", { n: chosen.length, names }))) return;
		void run(async () => {
			const removed = await api.removeCheckpoints(
				chosen.map((cp) => cp.id),
			);
			const next = new Set(selected);
			for (const cp of chosen) next.delete(cp.id);
			onSelect(next);
			setNotice({ kind: "removed", n: removed });
			onChanged();
		});
	}
	const [picking, setPicking] = useState<Checkpoint | null>(null);

	async function run(action: () => Promise<void>) {
		setBusy(true);
		setNotice(null);
		try {
			await action();
		} catch {
			setNotice({ kind: "error" });
		} finally {
			setBusy(false);
		}
	}

	const move = (cp: Checkpoint, up: boolean) =>
		run(async () => {
			await api.moveCheckpoint(cp.id, up);
			onChanged();
		});

	const save = (cp: Checkpoint, changes: Partial<Checkpoint>) =>
		run(async () => {
			await api.updateCheckpoint({ ...cp, ...changes });
			setEditing(null);
			onChanged();
		});

	function reissue(cp: Checkpoint) {
		if (!confirm(t("reissueConfirm", { name: cp.name }))) return;
		void run(async () => {
			const updated = await api.reissueCheckpoint(cp.id);
			setNotice({ kind: "reissued", name: updated.name });
			onChanged(updated);
		});
	}

	return (
		<section
			class="cp-route"
			aria-labelledby="route-h">
			<h2
				id="route-h"
				class="cp-section-title">
				{t("routeTitle")}
			</h2>
			<div class="cp-toolbar">
				{/* Selects every checkpoint, in use or not; only those in use are printed. */}
				<label class="cp-select-all">
					<input
						ref={allBox}
						type="checkbox"
						class="size-5"
						checked={allChosen}
						onChange={() =>
							onSelect(
								allChosen
									? new Set()
									: new Set(checkpoints.map((cp) => cp.id)),
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
						total: checkpoints.length,
					})}
				</span>
				<button
					type="button"
					class="btn btn-quiet btn-danger sm:ml-auto"
					disabled={busy || chosen.length === 0}
					onClick={removeChosen}>
					<Trash2
						size={ICON}
						aria-hidden="true"
					/>
					{t("removeSelected", { n: chosen.length })}
				</button>
			</div>
			{notice?.kind === "removed" && (
				<p
					class="notice notice-ok mb-3"
					role="status">
					{t("removed", { n: notice.n })}
				</p>
			)}
			{notice?.kind === "reissued" && (
				<p
					class="notice notice-ok mb-3"
					role="status">
					{t("reissued", { name: notice.name })}
				</p>
			)}
			{notice?.kind === "error" && (
				<p
					class="notice notice-warn mb-3"
					role="alert">
					{t("saveError")}
				</p>
			)}
			<div class="cp-table-wrap">
				<table class="cp-table">
					<thead>
						<tr>
							<th
								scope="col"
								class="c-no">
								{t("colNo")}
							</th>
							<th
								scope="col"
								class="c-sel">
								<span class="sr-only">{t("select")}</span>
							</th>
							<th
								scope="col"
								class="c-move">
								{t("colOrder")}
							</th>
							<th
								scope="col"
								class="c-name">
								{t("checkpointName")}
							</th>
							<th
								scope="col"
								class="c-code">
								{t("colCode")}
							</th>
							<th
								scope="col"
								class="c-status">
								{t("colStatus")}
							</th>
							<th
								scope="col"
								class="c-loc">
								{t("colLocation")}
							</th>
							<th
								scope="col"
								class="c-act">
								<span class="sr-only">{t("colActions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{checkpoints.map((cp, i) => (
							<tr
								key={cp.id}
								class={`${selected.has(cp.id) ? "is-selected" : ""} ${cp.active ? "" : "is-off"}`}>
								<td class="c-no">
									<span class="stop-badge">
										{cp.routeOrder}
									</span>
								</td>
								<td class="c-sel">
									<input
										type="checkbox"
										class="size-5"
										aria-label={`${t("select")}: ${cp.name}`}
										checked={selected.has(cp.id)}
										onChange={() => toggle(cp.id)}
									/>
								</td>
								<td class="c-move">
									<span class="inline-flex items-center gap-1">
										<IconButton
											icon={ChevronUp}
											label={t("moveUp", {
												name: cp.name,
											})}
											tip={t("moveUpTip")}
											disabled={busy || i === 0}
											onClick={() => void move(cp, true)}
										/>
										<IconButton
											icon={ChevronDown}
											label={t("moveDown", {
												name: cp.name,
											})}
											tip={t("moveDownTip")}
											disabled={
												busy ||
												i === checkpoints.length - 1
											}
											onClick={() => void move(cp, false)}
										/>
									</span>
								</td>
								<td class="c-name">
									{editing?.id === cp.id ? (
										<form
											class="flex flex-wrap items-center gap-2"
											noValidate
											onSubmit={(e) => {
												e.preventDefault();
												const problem =
													checkpointNameProblem(
														editing.name,
														checkpoints,
														cp.id,
													);
												if (problem) {
													setEditing({
														...editing,
														problem,
													});
													return;
												}
												void save(cp, {
													name: tidyCheckpointName(
														editing.name,
													),
												});
											}}>
											<input
												class="field min-w-40 flex-1"
												aria-label={t("checkpointName")}
												required
												minLength={CHECKPOINT_NAME_MIN}
												maxLength={CHECKPOINT_NAME_MAX}
												aria-invalid={!!editing.problem}
												value={editing.name}
												onInput={(e) =>
													setEditing({
														id: cp.id,
														name: e.currentTarget
															.value,
													})
												}
											/>
											<button
												class="icon-btn"
												aria-label={t("save")}
												data-tip={t("save")}
												disabled={busy}>
												<Check
													size={ICON}
													aria-hidden="true"
												/>
											</button>
											<IconButton
												icon={X}
												label={t("cancel")}
												onClick={() => setEditing(null)}
											/>
											{editing.problem && (
												<p
													class="w-full text-sm text-warn"
													role="alert">
													{t(editing.problem, {
														min: CHECKPOINT_NAME_MIN,
														max: CHECKPOINT_NAME_MAX,
													})}
												</p>
											)}
										</form>
									) : (
										cp.name
									)}
								</td>
								<td
									class="c-code"
									data-label={t("colCode")}>
									{cp.manualCode}
								</td>
								<td class="c-status">
									<span
										class={`cp-status ${cp.active ? "is-on" : "is-off"}`}>
										{t(
											cp.active
												? "checkpointInUse"
												: "checkpointNotInUse",
										)}
									</span>
								</td>
								<td
									class="c-loc"
									data-label={t("colLocation")}>
									<span class="inline-flex items-center gap-2">
										<span
											class={
												cp.location
													? "font-mono text-sm"
													: "text-muted"
											}>
											{cp.location
												? formatLocation(cp.location)
												: t("locationNotSet")}
										</span>
										<IconButton
											icon={
												cp.location
													? MapPinPen
													: MapPinPlus
											}
											label={`${t(cp.location ? "editLocation" : "setLocation")}: ${cp.name}`}
											tip={t(
												cp.location
													? "editLocation"
													: "setLocation",
											)}
											disabled={busy}
											onClick={() => setPicking(cp)}
										/>
									</span>
								</td>
								<td class="c-act">
									<span class="icon-row">
										<IconButton
											icon={Pencil}
											label={`${t("rename")}: ${cp.name}`}
											tip={t("rename")}
											disabled={busy}
											onClick={() =>
												setEditing({
													id: cp.id,
													name: cp.name,
												})
											}
										/>
										<IconButton
											icon={cp.active ? EyeOff : Eye}
											label={`${t(cp.active ? "deactivate" : "activate")}: ${cp.name}`}
											tip={t(
												cp.active
													? "checkpointOffTip"
													: "checkpointOnTip",
											)}
											disabled={busy}
											onClick={() =>
												void save(cp, {
													active: !cp.active,
												})
											}
										/>
										{cp.active && (
											<IconButton
												icon={RefreshCw}
												class="icon-btn-danger"
												label={`${t("reissue")}: ${cp.name}`}
												tip={t("reissueTip")}
												disabled={busy}
												onClick={() => reissue(cp)}
											/>
										)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{picking && (
				<LocationPicker
					name={picking.name}
					initial={picking.location}
					onSave={async (location) => {
						await api.setCheckpointLocation(picking.id, location);
						onChanged();
					}}
					onClose={() => setPicking(null)}
				/>
			)}
		</section>
	);
}
