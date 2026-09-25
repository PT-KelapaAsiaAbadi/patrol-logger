import { useState } from "preact/hooks";
import { useApp } from "../../state";
import * as api from "../../data/api";
import type { Account } from "../../types";

type Notice =
	| { kind: "password"; name: string; password: string }
	| { kind: "error" }
	| null;

/** Every account, with a new-password and a deactivate/reactivate action. Not for your own row. */
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

	function resetPassword(a: Account) {
		if (!confirm(t("passwordResetConfirm", { name: a.name }))) return;
		void run(async () => {
			const password = await api.resetPassword(a.id);
			setNotice({ kind: "password", name: a.name, password });
		});
	}

	function toggleActive(a: Account) {
		if (a.active && !confirm(t("deactivateConfirm", { name: a.name })))
			return;
		void run(async () => {
			await api.setAccountActive(a.id, !a.active);
			onChanged();
		});
	}

	return (
		<>
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
							<th scope="col">{t("email")}</th>
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
									<td>{a.email}</td>
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
										{!self && (
											<span class="inline-flex flex-wrap gap-x-4 gap-y-1">
												<button
													type="button"
													class="link-btn"
													disabled={busy || !a.active}
													onClick={() =>
														resetPassword(a)
													}>
													{t("newPassword")}
												</button>
												<button
													type="button"
													class="link-btn"
													disabled={busy}
													onClick={() =>
														toggleActive(a)
													}>
													{t(
														a.active
															? "deactivate"
															: "activate",
													)}
												</button>
											</span>
										)}
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
