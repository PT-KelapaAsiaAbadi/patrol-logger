/**
 * The More tab of the phone and tablet tab bar (SupervisorShell): the signed-in supervisor, the
 * screens that don't fit in the tab bar (Accounts, Checkpoints and QR), and Sign out. On a desktop
 * all of these are in the header, so nothing links here, but the page still works if opened.
 */
import { Link } from "wouter-preact";
import type { LucideIcon } from "lucide-preact";
import { ChevronRight, LogOut, QrCode, Users } from "lucide-preact";
import { useApp } from "../../state";
import type { Key } from "../../i18n";
import { initials } from "../../lib/personName";
import { ICON } from "../../components/IconButton";
import { useSignOut } from "../../components/SupervisorShell";

const LINKS: { href: string; icon: LucideIcon; label: Key }[] = [
	{ href: "/supervisor/guards", icon: Users, label: "navGuards" },
	{ href: "/supervisor/checkpoints", icon: QrCode, label: "navCheckpoints" },
];

export function More() {
	const { t, user } = useApp();
	const signOut = useSignOut();

	return (
		<div class="max-w-xl grid gap-4">
			<h1 class="dash-title">{t("navMore")}</h1>

			<div class="more-card more-profile">
				<span
					class="shell-avatar is-large"
					aria-hidden="true">
					{initials(user!.name)}
				</span>
				<span class="grid">
					<span class="font-bold text-lg">{user!.name}</span>
					<span class="text-muted">{t("roleSupervisor")}</span>
				</span>
			</div>

			<ul class="more-card more-list">
				{LINKS.map(({ href, icon: Icon, label }) => (
					<li key={href}>
						<Link
							href={href}
							class="more-item">
							<Icon
								size={20}
								aria-hidden="true"
							/>
							<span class="flex-1">{t(label)}</span>
							<ChevronRight
								size={ICON}
								class="text-muted"
								aria-hidden="true"
							/>
						</Link>
					</li>
				))}
			</ul>

			<button
				type="button"
				class="btn btn-quiet btn-lg more-signout"
				onClick={signOut}>
				<LogOut
					size={ICON}
					aria-hidden="true"
				/>
				{t("signOut")}
			</button>
		</div>
	);
}
