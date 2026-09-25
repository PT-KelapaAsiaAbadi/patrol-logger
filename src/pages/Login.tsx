import { useState } from "preact/hooks";
import { useLocation } from "wouter-preact";
import { useApp } from "../state";
import * as api from "../data/api";
import { ICON } from "../components/IconButton";
import { LogIn } from "lucide-preact";

export function Login() {
	const { t, setUser } = useApp();
	const [, navigate] = useLocation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<"wrong" | "unreachable" | null>(null);

	async function submit() {
		setBusy(true);
		setError(null);
		try {
			const user = await api.signIn(email, password);
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
		<main class="mx-auto w-full max-w-sm px-5 pt-10 pb-12">
			<h1 class="text-2xl font-bold mb-6">{t("signInTitle")}</h1>

			<form
				class="grid gap-4"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}>
				<label class="grid gap-1">
					<span class="font-medium">{t("email")}</span>
					<input
						class="field"
						type="email"
						autoComplete="username"
						autoCapitalize="none"
						spellcheck={false}
						required
						value={email}
						onInput={(e) => setEmail(e.currentTarget.value)}
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
					class="btn btn-primary btn-lg"
					disabled={busy}>
					<LogIn
						size={ICON}
						aria-hidden="true"
					/>
					{busy ? t("signingIn") : t("signIn")}
				</button>
			</form>
		</main>
	);
}
