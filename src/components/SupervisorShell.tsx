/**
 * The frame around every supervisor screen. One header, laid out by index.css ("Supervisor shell"):
 *   - desktop (1024px and up): stays at the top while the page scrolls, with the Today, Log
 *     Database, Schedule, Map, Accounts and Checkpoints tabs, the theme and language switches,
 *     the signed-in supervisor and Sign out
 *   - phones and tablets: a slim top bar (name and the two switches), and a tab bar fixed to the
 *     bottom of the screen: Today, Log, Schedule, Map and More. More (pages/supervisor/More.tsx)
 *     holds Accounts, Checkpoints and Sign out.
 * Supervisor pages use the full desktop width (up to 90rem): they're used at a desk, and Today's
 * dashboard needs the room.
 */
import type { ComponentChildren } from "preact";
import { Link, useLocation } from "wouter-preact";
import type { LucideIcon } from "lucide-preact";
import {
	CalendarCheck,
	CalendarClock,
	Database,
	Ellipsis,
	LogOut,
	Map,
	QrCode,
	Users,
} from "lucide-preact";
import { useApp } from "../state";
import * as api from "../data/api";
import type { Key } from "../i18n";
import { initials } from "../lib/personName";
import { ICON } from "../components/IconButton";
import { DisplayControls } from "./LanguageBar";

interface Destination {
	href: string;
	icon: LucideIcon;
	/** Label on the desktop tab. */
	label: Key;
	/** Shorter label for the phone tab bar, where it differs. */
	short?: Key;
	/** Whether this tab is the current one for a location. */
	current: (location: string) => boolean;
}

const TODAY: Destination = {
	href: "/supervisor",
	icon: CalendarCheck,
	label: "navToday",
	// A scan's details are opened from Today (and the map), so Today stays highlighted.
	current: (l) => l === "/supervisor" || l.startsWith("/supervisor/scans"),
};
const LOG: Destination = {
	href: "/supervisor/log",
	icon: Database,
	label: "navLogDatabase",
	short: "navLogShort",
	current: (l) => l === "/supervisor/log",
};
const SCHEDULE: Destination = {
	href: "/supervisor/schedule",
	icon: CalendarClock,
	label: "navSchedule",
	current: (l) => l === "/supervisor/schedule",
};
const MAP: Destination = {
	href: "/supervisor/map",
	icon: Map,
	label: "navMap",
	current: (l) => l === "/supervisor/map",
};
const ACCOUNTS: Destination = {
	href: "/supervisor/guards",
	icon: Users,
	label: "navGuards",
	current: (l) => l === "/supervisor/guards",
};
const CHECKPOINTS: Destination = {
	href: "/supervisor/checkpoints",
	icon: QrCode,
	label: "navCheckpoints",
	current: (l) => l === "/supervisor/checkpoints",
};
const MORE: Destination = {
	href: "/supervisor/more",
	icon: Ellipsis,
	label: "navMore",
	// Accounts and Checkpoints are opened from More on a phone, so More stays highlighted.
	current: (l) =>
		l === "/supervisor/more" ||
		ACCOUNTS.current(l) ||
		CHECKPOINTS.current(l),
};

/** Desktop tabs, left to right. */
const TABS = [TODAY, LOG, SCHEDULE, MAP, ACCOUNTS, CHECKPOINTS];
/** Phone and tablet tab bar: five fit a small phone; the rest are under More. */
const BOTTOM_TABS = [TODAY, LOG, SCHEDULE, MAP, MORE];

/** Signs out and goes to the sign-in screen. Also used by the More page. */
export function useSignOut() {
	const { setUser } = useApp();
	const [, navigate] = useLocation();
	return () => {
		api.signOut();
		setUser(null);
		navigate("/login");
	};
}

export function SupervisorShell({ children }: { children: ComponentChildren }) {
	const { t, user } = useApp();
	const [location] = useLocation();
	const signOut = useSignOut();

	return (
		<div class="min-h-full flex flex-col">
			<header class="shell-header">
				<div class="shell-bar">
					<span class="shell-brand">Patroli</span>
					<nav
						class="shell-tabs"
						aria-label={t("navMain")}>
						{TABS.map((d) => {
							const on = d.current(location);
							return (
								<Link
									key={d.href}
									href={d.href}
									class={`shell-tab ${on ? "is-active" : ""}`}
									aria-current={on ? "page" : undefined}>
									<d.icon
										size={ICON}
										aria-hidden="true"
									/>
									{t(d.label)}
								</Link>
							);
						})}
					</nav>
					<div class="shell-tools">
						<DisplayControls />
						<span class="shell-user">
							<span
								class="shell-avatar"
								aria-hidden="true">
								{initials(user!.name)}
							</span>
							<span class="shell-user-text">
								<span class="font-semibold">{user!.name}</span>
								<span class="text-sm text-muted">
									{t("roleSupervisor")}
								</span>
							</span>
						</span>
						<button
							type="button"
							class="shell-signout"
							data-tip={t("signOut")}
							onClick={signOut}>
							<LogOut
								size={ICON}
								aria-hidden="true"
							/>
							<span class="shell-signout-label">
								{t("signOut")}
							</span>
						</button>
					</div>
				</div>
			</header>
			<main class="shell-main flex-1 max-w-360 w-full mx-auto px-4 sm:px-5">
				{children}
			</main>
			<nav
				class="shell-bottom"
				aria-label={t("navMain")}>
				{BOTTOM_TABS.map((d) => {
					const on = d.current(location);
					return (
						<Link
							key={d.href}
							href={d.href}
							class={`shell-bottom-tab ${on ? "is-active" : ""}`}
							aria-current={on ? "page" : undefined}>
							<d.icon
								size={22}
								aria-hidden="true"
							/>
							<span>{t(d.short ?? d.label)}</span>
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
