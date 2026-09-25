import type { ComponentChildren } from "preact";
import { Link, useLocation } from "wouter-preact";
import { useApp } from "../state";
import * as api from "../data/api";
import { ICON } from "../components/IconButton";
import { ClipboardList, LogOut, Map, QrCode, Users } from "lucide-preact";

export function SupervisorShell({ children }: { children: ComponentChildren }) {
	const { t, user, setUser } = useApp();
	const [location, navigate] = useLocation();
	const nav = [
		{
			href: "/supervisor",
			label: t("navLog"),
			icon: ClipboardList,
			active:
				location === "/supervisor" ||
				location.startsWith("/supervisor/scans"),
		},
		{
			href: "/supervisor/map",
			label: t("navMap"),
			icon: Map,
			active: location === "/supervisor/map",
		},
		{
			href: "/supervisor/guards",
			label: t("navGuards"),
			icon: Users,
			active: location === "/supervisor/guards",
		},
		{
			href: "/supervisor/checkpoints",
			label: t("navCheckpoints"),
			icon: QrCode,
			active: location === "/supervisor/checkpoints",
		},
	];

	return (
		<div class="min-h-full flex flex-col">
			<header class="border-b border-line bg-surface">
				<div class="max-w-5xl mx-auto px-5 flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
					<span class="font-bold text-lg">Patroli</span>
					<nav class="flex gap-1 -mb-2 order-last w-full sm:order-0 sm:w-auto">
						{nav.map((n) => (
							<Link
								key={n.href}
								href={n.href}
								class={`tab ${n.active ? "is-active" : ""}`}
								aria-current={n.active ? "page" : undefined}>
								<n.icon
									size={ICON}
									aria-hidden="true"
								/>
								{n.label}
							</Link>
						))}
					</nav>
					<span class="ml-auto text-muted">{user!.name}</span>
					<button
						type="button"
						class="link-btn"
						onClick={() => {
							api.signOut();
							setUser(null);
							navigate("/login");
						}}>
						<LogOut
							size={ICON}
							aria-hidden="true"
						/>
						{t("signOut")}
					</button>
				</div>
			</header>
			<main class="flex-1 max-w-5xl w-full mx-auto px-5 py-6">
				{children}
			</main>
		</div>
	);
}
