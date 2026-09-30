/**
 * The sign-in screen (phone number and password). Afterwards guards go to their round and
 * supervisors to Today. There's no sign-up: a supervisor creates every account.
 * Looks like the supervisor pages: blue, a card with the form (index.css, "Sign-in page").
 */
import { useState } from "preact/hooks";
import { useLocation } from "wouter-preact";
import { useApp } from "../state";
import * as api from "../data/api";
import { ICON } from "../components/IconButton";
import { keepPhoneChars, PHONE_INPUT_MAX } from "../lib/phone";
import { LogIn, ShieldCheck } from "lucide-preact";

/**
 * Login page for both Guards and Supervisors (they share the same one).
 */
export function Login() {
	const { t, setUser } = useApp();
	const [, navigate] = useLocation();

	const [phone, setPhone] = useState("");
	const [password, setPassword] = useState("");

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<"wrong" | "unreachable" | null>(null);

	async function submit() {
		setBusy(true);
		setError(null);
		try {
			const user = await api.signIn(phone, password);
			if (!user) {
				setError("wrong");
				return;
			}
			setUser(user);
			navigate(user.role === "supervisor" ? "/supervisor" : "/");
		} catch {
			setError("unreachable");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main class="login-page">
			<div class="login-inner">
				<div class="login-head">
					<span
						class="login-badge"
						aria-hidden="true">
						<ShieldCheck size={28} />
					</span>
					<h1 class="dash-title">{t("signInTitle")}</h1>
					<p class="text-muted">{t("signInHint")}</p>
				</div>

				<form
					class="login-card"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}>
					<label class="grid gap-1">
						<span class="font-medium">{t("phone")}</span>
						{/* "username" so password managers save the number with the password */}
						<input
							class="field"
							type="tel"
							inputMode="tel"
							autoComplete="username"
							placeholder={t("phonePlaceholder")}
							required
							maxLength={PHONE_INPUT_MAX}
							value={phone}
							onInput={(e) => {
								const kept = keepPhoneChars(
									e.currentTarget.value,
								);
								e.currentTarget.value = kept;
								setPhone(kept);
							}}
						/>
					</label>
					<label class="grid gap-1">
						<span class="font-medium">{t("password")}</span>
						<input
							class="field"
							type="password"
							autoComplete="current-password"
							autoCapitalize="none"
							required
							value={password}
							onInput={(e) => setPassword(e.currentTarget.value)}
						/>
					</label>
					{error && (
						<p
							class="notice notice-warn"
							role="alert">
							{t(
								error === "wrong"
									? "signInError"
									: "signInUnreachable",
							)}
						</p>
					)}
					<button
						class="btn btn-primary btn-lg w-full"
						disabled={busy}>
						<LogIn
							size={ICON}
							aria-hidden="true"
						/>
						{busy ? t("signingIn") : t("signIn")}
					</button>
				</form>
				<p class="login-foot">{t("forgotPassword")}</p>
			</div>
		</main>
	);
}
