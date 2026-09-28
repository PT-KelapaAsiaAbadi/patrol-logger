/**
 * The account list on the Accounts tab: every guard and supervisor with their sign-in phone number,
 * and buttons to change that number, give someone a new password, or switch their account off and
 * on again. "Confirm number" is shown but disabled until one-time codes exist (see the TODO below).
 */

import { useState } from "preact/hooks";
import { useApp } from "../../state";
import * as api from "../../data/api";
import { formatPhone } from "../../lib/phone";
import type { Account } from "../../types";
import { ICON, IconButton } from "../../components/IconButton";
import {
	KeyRound,
	Save,
	ShieldCheck,
	Smartphone,
	UserCheck,
	UserX,
	X,
} from "lucide-preact";

type Notice =
	| { kind: "password"; name: string; password: string }
	| { kind: "error" }
	| null;

/** The change-number form open above the table, for one account at a time. */
type Panel = { account: Account } | null;

/**
 * Lists every account, with a new-password and a deactivate/reactivate action.
 * Not for your own row.
 */
export function AccountsTable({
	accounts,
	onChanged,
}: {
	accounts: Account[];
	onChanged: () => void;
}) {
	const { t, user } = useApp();
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<Notice>(null);
	const [panel, setPanel] = useState<Panel>(null);

	async function run(action: () => Promise<void>) {
		setBusy(true);
		setNotice(null);
		setPanel(null);
		try {
			await action();
		} catch {
			setNotice({ kind: "error" });
		} finally {
			setBusy(false);
		}
	}

	function resetPassword(a: Account) {
		if (!confirm(t("passwordResetConfirm", { name: a.name }))) return;

		void run(async () => {
			// set new password (auto-generated).
			const password = await api.resetPassword(a.id);
			setNotice({ kind: "password", name: a.name, password });
		});
	}

	// supervisors can toggle other accounts' active state.
	// temporary: business rule assumes 1 supervisor for now (and 1 IT admin).
	function toggleActive(a: Account) {
		if (a.active && !confirm(t("deactivateConfirm", { name: a.name })))
			return;

		void run(async () => {
			await api.setAccountActive(a.id, !a.active);
			onChanged();
		});
	}

	/** Opens the change-number form for one account (only one at a time). */
	function openChangePhone(a: Account) {
		setNotice(null);
		setPanel({ account: a });
	}

	return (
		<>
			{panel && (
				<ChangePhone
					key={panel.account.id}
					account={panel.account}
					onClose={() => setPanel(null)}
					onSaved={onChanged}
				/>
			)}
			{notice?.kind === "password" && (
				<div
					class="notice notice-ok mb-3"
					role="status">
					<p>
						{t("newPasswordFor", { name: notice.name })}{" "}
						<span class="font-mono font-semibold">
							{notice.password}
						</span>
					</p>
					<p class="text-muted">{t("shownOnce")}</p>
				</div>
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
							<th scope="col">{t("fullName")}</th>
							<th scope="col">{t("phone")}</th>
							<th scope="col">{t("colRole")}</th>
							<th scope="col">{t("colStatus")}</th>
							<th scope="col">
								<span class="sr-only">{t("colActions")}</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{accounts.map((a) => {
							const self = a.id === user?.id;
							return (
								<tr
									key={a.id}
									class={a.active ? "" : "text-muted"}>
									<td>
										{a.name}
										{self && (
											<span class="text-muted">
												{" "}
												{t("you")}
											</span>
										)}
									</td>
									<td class="whitespace-nowrap">
										{a.phone ? (
											<>
												{formatPhone(a.phone)}
												<span class="block text-sm text-muted">
													{t(
														a.phoneVerified
															? "phoneConfirmed"
															: "phoneUnconfirmed",
													)}
												</span>
											</>
										) : (
											// An account from before phone sign-in: it can't sign in yet.
											<span class="text-warn">
												{t("noPhone")}
											</span>
										)}
									</td>
									<td>
										{t(
											a.role === "supervisor"
												? "roleSupervisor"
												: "roleGuard",
										)}
									</td>
									<td>
										{t(
											a.active
												? "accountActive"
												: "accountInactive",
										)}
									</td>
									<td class="whitespace-nowrap">
										<span class="icon-row">
											{/* TODO: implement one-time codes, then enable this button: it should text a
											    code to the number and let the supervisor type in the code the person reads
											    out, setting phone_verified_at. Needs a real SMS provider. The earlier
											    version (PhoneCode.tsx, commit 947b3c6) did this. See README > TODO. */}
											{a.phone &&
												!a.phoneVerified &&
												a.active && (
													<IconButton
														icon={ShieldCheck}
														label={`${t("confirmNumber")}: ${a.name} (${t("notAvailableYet")})`}
														tip={t(
															"notAvailableYet",
														)}
														disabled
													/>
												)}
											{/* Not for your own row: you could lock yourself out. */}
											{!self && (
												<>
													<IconButton
														icon={Smartphone}
														label={`${t(a.phone ? "changePhone" : "addPhone")}: ${a.name}`}
														tip={t(
															"changePhoneTip",
														)}
														disabled={busy}
														onClick={() =>
															openChangePhone(a)
														}
													/>
													<IconButton
														icon={KeyRound}
														label={`${t("newPassword")}: ${a.name}`}
														tip={t(
															"newPasswordTip",
														)}
														disabled={
															busy || !a.active
														}
														onClick={() =>
															resetPassword(a)
														}
													/>
													<IconButton
														icon={
															a.active
																? UserX
																: UserCheck
														}
														class={
															a.active
																? "icon-btn-danger"
																: ""
														}
														label={`${t(a.active ? "deactivate" : "activate")}: ${a.name}`}
														tip={t(
															a.active
																? "accountOffTip"
																: "accountOnTip",
														)}
														disabled={busy}
														onClick={() =>
															toggleActive(a)
														}
													/>
												</>
											)}
										</span>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</>
	);
}

/** Gives an account a new sign-in number (or a first one). The number must not belong to anyone else. */
function ChangePhone({
	account,
	onClose,
	onSaved,
}: {
	account: Account;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { t } = useApp();
	const [phone, setPhone] = useState("");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<
		| { kind: "saved"; phone: string }
		| { kind: "problem"; key: "invalidPhone" | "phoneExists" | "saveError" }
		| null
	>(null);

	async function save() {
		setBusy(true);
		setResult(null);
		try {
			const saved = await api.changePhone(account.id, phone);
			setResult({ kind: "saved", phone: saved });
			onSaved();
		} catch (e) {
			const why = api.refusalCode(e);
			setResult({
				kind: "problem",
				key:
					why === "invalid_phone"
						? "invalidPhone"
						: why === "phone_exists"
							? "phoneExists"
							: "saveError",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<section
			class="panel mb-3 grid gap-3"
			aria-label={t("newPhoneFor", { name: account.name })}>
			<div class="flex items-center justify-between gap-3">
				<h3 class="font-semibold">
					{t("newPhoneFor", { name: account.name })}
				</h3>
				<IconButton
					icon={X}
					label={t("cancel")}
					onClick={onClose}
				/>
			</div>
			{result?.kind === "saved" ? (
				<p
					class="notice notice-ok"
					role="status">
					{t("phoneSaved", {
						name: account.name,
						phone: formatPhone(result.phone),
					})}
				</p>
			) : (
				<form
					class="flex flex-wrap items-end gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						void save();
					}}>
					<label class="grid gap-1">
						<span class="font-medium">{t("phone")}</span>
						<input
							class="field"
							type="tel"
							inputMode="tel"
							autoComplete="off"
							placeholder={
								account.phone
									? formatPhone(account.phone)
									: "0812-3456-7890"
							}
							required
							value={phone}
							onInput={(e) => setPhone(e.currentTarget.value)}
						/>
					</label>
					<button
						class="btn btn-primary"
						disabled={busy}>
						<Save
							size={ICON}
							aria-hidden="true"
						/>
						{busy ? t("saving") : t("save")}
					</button>
				</form>
			)}
			{result?.kind === "problem" && (
				<p
					class="notice notice-warn"
					role="alert">
					{t(result.key)}
				</p>
			)}
		</section>
	);
}
