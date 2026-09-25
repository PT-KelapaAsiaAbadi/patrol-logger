import { useState } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync } from "../../hooks";
import * as api from "../../data/api";
import {
	GUARDS_CSV_TEMPLATE,
	parseGuardsCsv,
	passwordsToCsv,
	type GuardsCsv,
} from "../../lib/csv";
import { saveFile } from "../../lib/download";
import type { GuardImportResult, NewGuard, Role } from "../../types";
import { LoadError } from "./Log";
import { AccountsTable } from "./AccountsTable";
import { ICON } from "../../components/IconButton";
import { Download, Upload, UserPlus, X } from "lucide-preact";

const PREVIEW_ROWS = 50;

type Outcome = { kind: "done"; result: GuardImportResult } | { kind: "error" };

export function Guards() {
	const { t } = useApp();
	const accounts = useAsync(() => api.listAccounts(), []);

	return (
		<>
			<h1 class="text-xl font-bold">{t("navGuards")}</h1>

			<div class="admin-grid mt-4">
				<AddGuard onAdded={accounts.reload} />
				<ImportGuards onAdded={accounts.reload} />
			</div>

			<section
				class="mt-10"
				aria-labelledby="guard-list-h">
				<h2
					id="guard-list-h"
					class="text-lg font-semibold mb-3">
					{t("guardList")}
				</h2>
				{accounts.error && <LoadError onRetry={accounts.reload} />}
				{accounts.loading && !accounts.data && (
					<p class="text-muted">{t("loading")}</p>
				)}
				{accounts.data && (
					<AccountsTable
						accounts={accounts.data}
						onChanged={accounts.reload}
					/>
				)}
			</section>
		</>
	);
}

/** Sends guards to the backend and reports what happened. Shared by the single form and the CSV import. */
function useCreateGuards(onAdded: () => void) {
	const [busy, setBusy] = useState(false);
	const [outcome, setOutcome] = useState<Outcome | null>(null);

	async function create(guards: NewGuard[]): Promise<boolean> {
		setBusy(true);
		setOutcome(null);
		try {
			const result = await api.createGuards(guards);
			setOutcome({ kind: "done", result });
			if (result.created.length) onAdded();
			return true;
		} catch {
			setOutcome({ kind: "error" });
			return false;
		} finally {
			setBusy(false);
		}
	}

	return { busy, outcome, create, clear: () => setOutcome(null) };
}

function AddGuard({ onAdded }: { onAdded: () => void }) {
	const { t } = useApp();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("guard");
	const { busy, outcome, create } = useCreateGuards(onAdded);

	async function submit() {
		const ok = await create([
			{
				name: name.trim().replace(/\s+/g, " "),
				email: email.trim().toLowerCase(),
				role,
			},
		]);
		if (ok) {
			setName("");
			setEmail("");
			setRole("guard");
		}
	}

	return (
		<section
			class="panel"
			aria-labelledby="add-guard-h">
			<h2
				id="add-guard-h"
				class="font-semibold mb-3">
				{t("addGuardTitle")}
			</h2>
			<form
				class="grid gap-3"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}>
				<label class="grid gap-1">
					<span class="font-medium">{t("fullName")}</span>
					<input
						class="field"
						required
						autoComplete="off"
						value={name}
						onInput={(e) => setName(e.currentTarget.value)}
					/>
				</label>
				<label class="grid gap-1">
					<span class="font-medium">{t("email")}</span>
					<input
						class="field"
						type="email"
						required
						autoComplete="off"
						autoCapitalize="none"
						spellcheck={false}
						value={email}
						onInput={(e) => setEmail(e.currentTarget.value)}
					/>
				</label>
				<label class="grid gap-1">
					<span class="font-medium">{t("colRole")}</span>
					<select
						class="field"
						value={role}
						onChange={(e) =>
							setRole(e.currentTarget.value as Role)
						}>
						<option value="guard">{t("roleGuard")}</option>
						<option value="supervisor">
							{t("roleSupervisor")}
						</option>
					</select>
				</label>
				<button
					class="btn btn-primary"
					disabled={busy}>
					<UserPlus
						size={ICON}
						aria-hidden="true"
					/>
					{busy ? t("saving") : t("addGuard")}
				</button>
			</form>
			<CreateOutcome outcome={outcome} />
		</section>
	);
}

function ImportGuards({ onAdded }: { onAdded: () => void }) {
	const { t } = useApp();
	const [file, setFile] = useState<{ name: string; csv: GuardsCsv } | null>(
		null,
	);
	const { busy, outcome, create, clear } = useCreateGuards(onAdded);

	async function pick(f: File | undefined) {
		if (!f) return;
		clear();
		setFile({ name: f.name, csv: parseGuardsCsv(await f.text()) });
	}

	async function submit() {
		if (!file?.csv.guards.length) return;
		if (await create(file.csv.guards)) setFile(null);
	}

	const csv = file?.csv;

	return (
		<section
			class="panel"
			aria-labelledby="import-h">
			<h2
				id="import-h"
				class="font-semibold mb-1">
				{t("importGuardsTitle")}
			</h2>
			<p class="text-muted">{t("importGuardsHint")}</p>
			<button
				type="button"
				class="link-btn mt-1"
				onClick={() =>
					saveFile(
						"contoh-petugas.csv",
						GUARDS_CSV_TEMPLATE,
						"text/csv",
					)
				}>
				<Download
					size={ICON}
					aria-hidden="true"
				/>
				{t("downloadTemplate")}
			</button>

			<label
				class={`btn btn-quiet w-full mt-3 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
				<Upload
					size={ICON}
					aria-hidden="true"
				/>
				{t("chooseCsv")}
				<input
					type="file"
					accept=".csv,text/csv"
					class="sr-only"
					onChange={(e) => {
						void pick(e.currentTarget.files?.[0]);
						e.currentTarget.value = "";
					}}
				/>
			</label>

			{file && csv && (
				<div
					class="mt-4 grid gap-3"
					aria-live="polite">
					{csv.guards.length === 0 ? (
						<p class="notice notice-warn">
							{t("csvEmpty", { file: file.name })}
						</p>
					) : (
						<>
							<p class="font-medium">
								{t("csvReady", {
									file: file.name,
									n: csv.guards.length,
								})}
							</p>
							<div class="table-wrap max-h-64 overflow-y-auto">
								<table class="log-table">
									<thead>
										<tr>
											<th scope="col">{t("fullName")}</th>
											<th scope="col">{t("email")}</th>
										</tr>
									</thead>
									<tbody>
										{csv.guards
											.slice(0, PREVIEW_ROWS)
											.map((g) => (
												<tr key={g.email}>
													<td>{g.name}</td>
													<td>{g.email}</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
							{csv.guards.length > PREVIEW_ROWS && (
								<p class="text-muted">
									{t("csvMore", {
										n: csv.guards.length - PREVIEW_ROWS,
									})}
								</p>
							)}
						</>
					)}

					{csv.problems.length > 0 && (
						<div class="notice notice-warn">
							<p class="font-medium">{t("csvSkipped")}</p>
							<ul class="mt-1">
								{csv.problems
									.slice(0, PREVIEW_ROWS)
									.map((p) => (
										<li key={p.line}>
											{t("csvRow", { line: p.line })}:{" "}
											{t(`csv_${p.reason}`)}
										</li>
									))}
							</ul>
							{csv.problems.length > PREVIEW_ROWS && (
								<p>
									{t("csvMore", {
										n: csv.problems.length - PREVIEW_ROWS,
									})}
								</p>
							)}
						</div>
					)}

					<div class="flex flex-wrap gap-3">
						<button
							type="button"
							class="btn btn-primary"
							disabled={busy || csv.guards.length === 0}
							onClick={() => void submit()}>
							<UserPlus
								size={ICON}
								aria-hidden="true"
							/>
							{busy
								? t("saving")
								: t("addGuards", { n: csv.guards.length })}
						</button>
						<button
							type="button"
							class="btn btn-quiet"
							disabled={busy}
							onClick={() => setFile(null)}>
							<X
								size={ICON}
								aria-hidden="true"
							/>
							{t("cancel")}
						</button>
					</div>
				</div>
			)}
			<CreateOutcome outcome={outcome} />
		</section>
	);
}

function CreateOutcome({ outcome }: { outcome: Outcome | null }) {
	const { t } = useApp();
	if (!outcome) return null;
	if (outcome.kind === "error") {
		return (
			<p
				class="notice notice-warn mt-3"
				role="alert">
				{t("saveError")}
			</p>
		);
	}
	const { created, existing, failed } = outcome.result;
	return (
		<div
			class="grid gap-2 mt-3"
			role="status">
			{created.length > 0 && (
				<div class="notice notice-ok grid gap-2">
					<p class="font-medium">
						{t("guardsAdded", { n: created.length })}
					</p>
					<p>{t("passwordsOnce")}</p>
					<div class="table-wrap max-h-64 overflow-y-auto">
						<table class="log-table">
							<thead>
								<tr>
									<th scope="col">{t("fullName")}</th>
									<th scope="col">{t("email")}</th>
									<th scope="col">{t("password")}</th>
								</tr>
							</thead>
							<tbody>
								{created.map(({ user, password }) => (
									<tr key={user.id}>
										<td>{user.name}</td>
										<td>{user.email}</td>
										<td class="font-mono whitespace-nowrap">
											{password}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<button
						type="button"
						class="btn btn-quiet justify-self-start"
						onClick={() =>
							saveFile(
								"kata-sandi-petugas.csv",
								passwordsToCsv(created),
								"text/csv",
							)
						}>
						<Download
							size={ICON}
							aria-hidden="true"
						/>
						{t("downloadPasswords")}
					</button>
				</div>
			)}
			{existing.length > 0 && (
				<p class="notice notice-warn">
					{t("guardsExisting", { list: existing.join(", ") })}
				</p>
			)}
			{failed.length > 0 && (
				<p class="notice notice-warn">
					{t("guardsFailed", { list: failed.join(", ") })}
				</p>
			)}
		</div>
	);
}
