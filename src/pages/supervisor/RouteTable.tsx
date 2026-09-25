import { useState } from "preact/hooks";
import { useApp } from "../../state";
import * as api from "../../data/api";
import type { Checkpoint } from "../../types";

type Notice = { kind: "reissued"; name: string } | { kind: "error" } | null;

/**
 * The round as supervisors manage it: order, rename, take in or out of use, replace a sticker.
 * `onChanged` gets the checkpoint whose sticker was replaced, so the page can select it for printing.
 */
export function RouteTable({
	checkpoints,
	onChanged,
}: {
	checkpoints: Checkpoint[];
	onChanged: (reissued?: Checkpoint) => void;
}) {
	const { t } = useApp();
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<{ id: string; name: string } | null>(
		null,
	);
	const [notice, setNotice] = useState<Notice>(null);

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
			class="mt-8"
			aria-labelledby="route-h">
			<h2
				id="route-h"
				class="text-lg font-semibold mb-3">
				{t("routeTitle")}
			</h2>
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
			<div class="table-wrap">
				<table class="log-table">
					<thead>
						<tr>
							<th scope="col">{t("colStop")}</th>
							<th scope="col">{t("checkpointName")}</th>
							<th scope="col">{t("colCode")}</th>
							<th scope="col">{t("colStatus")}</th>
							<th scope="col">
								<span class="sr-only">{t("colActions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{checkpoints.map((cp, i) => (
							<tr
								key={cp.id}
								class={cp.active ? "" : "text-muted"}>
								<td class="tabular-nums whitespace-nowrap">
									<span class="inline-flex items-center gap-1">
										<button
											type="button"
											class="icon-btn"
											aria-label={t("moveUp", {
												name: cp.name,
											})}
											disabled={busy || i === 0}
											onClick={() => void move(cp, true)}>
											↑
										</button>
										<button
											type="button"
											class="icon-btn"
											aria-label={t("moveDown", {
												name: cp.name,
											})}
											disabled={
												busy ||
												i === checkpoints.length - 1
											}
											onClick={() =>
												void move(cp, false)
											}>
											↓
										</button>
										<span class="ml-1">
											{cp.routeOrder}
										</span>
									</span>
								</td>
								<td>
									{editing?.id === cp.id ? (
										<form
											class="flex flex-wrap gap-2"
											onSubmit={(e) => {
												e.preventDefault();
												void save(cp, {
													name: editing.name,
												});
											}}>
											<input
												class="field min-w-40 flex-1"
												aria-label={t("checkpointName")}
												required
												maxLength={80}
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
												class="btn btn-primary"
												disabled={busy}>
												{t("save")}
											</button>
											<button
												type="button"
												class="btn btn-quiet"
												onClick={() =>
													setEditing(null)
												}>
												{t("cancel")}
											</button>
										</form>
									) : (
										cp.name
									)}
								</td>
								<td class="font-mono whitespace-nowrap">
									{cp.manualCode}
								</td>
								<td class="whitespace-nowrap">
									{t(
										cp.active
											? "checkpointInUse"
											: "checkpointNotInUse",
									)}
								</td>
								<td class="whitespace-nowrap">
									<span class="inline-flex flex-wrap gap-x-4 gap-y-1">
										<button
											type="button"
											class="link-btn"
											disabled={busy}
											onClick={() =>
												setEditing({
													id: cp.id,
													name: cp.name,
												})
											}>
											{t("rename")}
										</button>
										<button
											type="button"
											class="link-btn"
											disabled={busy}
											onClick={() =>
												void save(cp, {
													active: !cp.active,
												})
											}>
											{t(
												cp.active
													? "deactivate"
													: "activate",
											)}
										</button>
										{cp.active && (
											<button
												type="button"
												class="link-btn"
												disabled={busy}
												onClick={() => reissue(cp)}>
												{t("reissue")}
											</button>
										)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
