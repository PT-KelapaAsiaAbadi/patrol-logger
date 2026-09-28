/**
 * The frame around every supervisor screen: a header with the Today, Log Database, Map, Accounts
 * and Checkpoints tabs and the sign-out button. Supervisor pages use the full desktop width (up
 * to 90rem): they're used at a desk, and Today's dashboard needs the room.
 */
import type { ComponentChildren } from "preact";
import { Link, useLocation } from "wouter-preact";
import { useApp } from "../state";
import * as api from "../data/api";
import { ICON } from "../components/IconButton";
import {
	CalendarCheck,
	Database,
	LogOut,
	Map,
	QrCode,
	Users,
} from "lucide-preact";

export function SupervisorShell({ children }: { children: ComponentChildren }) {
	const { t, user, setUser } = useApp();
	const [location, navigate] = useLocation();
	const nav = [
		{
			href: "/supervisor",
			label: t("navToday"),
			icon: CalendarCheck,
			// A scan's details are opened from Today (and the map), so Today stays highlighted.
			active:
				location === "/supervisor" ||
				location.startsWith("/supervisor/scans"),
		},
		{
			href: "/supervisor/log",
			label: t("navLogDatabase"),
			icon: Database,
			active: location === "/supervisor/log",
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
				<div class="max-w-360 mx-auto px-5 flex flex-wrap items-center gap-x-6 gap-y-1 py-2">
					<span class="font-bold text-lg">Patroli</span>
					{/* On a phone the tabs get their own row and scroll sideways, so the page never does. */}
					<nav class="flex gap-1 -mb-2 order-last w-full overflow-x-auto sm:order-0 sm:w-auto">
						{nav.map((n) => (
							<Link
								key={n.href}
								href={n.href}
								class={`tab shrink-0 whitespace-nowrap ${n.active ? "is-active" : ""}`}
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
			<main class="flex-1 max-w-360 w-full mx-auto px-4 sm:px-5 py-6">
				{children}
			</main>
		</div>
	);
}
