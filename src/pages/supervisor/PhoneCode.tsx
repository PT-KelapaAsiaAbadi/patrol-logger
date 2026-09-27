/**
 * Confirming a staff member's phone number with a one-time code: the code is texted to them, they
 * read it out, and the supervisor types it here. Used right after adding an account and from the
 * account list. It proves the number reaches the person being registered; it doesn't sign them in.
 */
import { useState } from "preact/hooks";
import { useApp } from "../../state";
import * as api from "../../data/api";
import { formatPhone } from "../../lib/phone";
import { ICON } from "../../components/IconButton";
import { MessageSquare, ShieldCheck } from "lucide-preact";

type Notice =
	| "confirmed"
	| "wrongCode"
	| "codeTooSoon"
	| "codeSendFailed"
	| "saveError"
	| null;

export function PhoneCode({
	account,
	alreadySent,
	onConfirmed,
}: {
	account: { id: string; name: string; phone: string };
	/** True when create-guards already texted the code, so the page opens on the code field. */
	alreadySent: boolean;
	onConfirmed?: () => void;
}) {
	const { t } = useApp();
	const [sent, setSent] = useState(alreadySent);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState<"sending" | "checking" | null>(null);
	const [notice, setNotice] = useState<Notice>(null);

	async function send() {
		setBusy("sending");
		setNotice(null);
		try {
			await api.sendPhoneCode(account.id);
			setSent(true);
			setCode("");
		} catch (e) {
			const why = api.refusalCode(e);
			setNotice(
				why === "too_soon"
					? "codeTooSoon"
					: why === "send_failed"
						? "codeSendFailed"
						: "saveError",
			);
		} finally {
			setBusy(null);
		}
	}

	async function check() {
		setBusy("checking");
		setNotice(null);
		try {
			await api.verifyPhoneCode(account.id, code);
			setNotice("confirmed");
			onConfirmed?.();
		} catch (e) {
			setNotice(
				api.refusalCode(e) === "wrong_code" ? "wrongCode" : "saveError",
			);
		} finally {
			setBusy(null);
		}
	}

	if (notice === "confirmed") {
		return (
			<p
				class="notice notice-ok"
				role="status">
				{t("numberConfirmed", { name: account.name })}
			</p>
		);
	}

	return (
		<div class="grid gap-2">
			{sent ? (
				<form
					class="grid gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void check();
					}}>
					<p>
						{t("codeSentTo", {
							phone: formatPhone(account.phone),
							name: account.name,
						})}
					</p>
					<label class="grid gap-1">
						<span class="font-medium">{t("messageCodeLabel")}</span>
						<input
							class="field font-mono tracking-widest max-w-40"
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]{6}"
							maxLength={6}
							required
							value={code}
							onInput={(e) =>
								setCode(
									e.currentTarget.value.replace(/\D/g, ""),
								)
							}
						/>
					</label>
					<div class="flex flex-wrap items-center gap-3">
						<button
							class="btn btn-primary"
							disabled={busy !== null || code.length !== 6}>
							<ShieldCheck
								size={ICON}
								aria-hidden="true"
							/>
							{busy === "checking"
								? t("checkingCode")
								: t("confirmNumber")}
						</button>
						<button
							type="button"
							class="link-btn"
							disabled={busy !== null}
							onClick={() => void send()}>
							{busy === "sending"
								? t("sendingCode")
								: t("sendCodeAgain")}
						</button>
					</div>
				</form>
			) : (
				<div class="grid gap-2">
					<p class="text-muted">{t("sendCodeCost")}</p>
					<button
						type="button"
						class="btn btn-quiet justify-self-start"
						disabled={busy !== null}
						onClick={() => void send()}>
						<MessageSquare
							size={ICON}
							aria-hidden="true"
						/>
						{busy === "sending" ? t("sendingCode") : t("sendCode")}
					</button>
				</div>
			)}
			{notice && (
				<p
					class="notice notice-warn"
					role="alert">
					{t(notice)}
				</p>
			)}
		</div>
	);
}
