/**
 * The app's routes (hash URLs such as #/scan) and who may open each: signed-out people go to
 * the sign-in screen, guards to their round, supervisors to Today. The language bar sits above
 * the sign-in and guard pages; supervisor pages have the same switches in their own header.
 */
import type { ComponentChildren } from "preact";
import { Redirect, Route, Router, Switch, useLocation } from "wouter-preact";
import { useHashLocation } from "wouter-preact/use-hash-location";
import { useApp } from "./state";
import type { Role } from "./types";
import { LanguageBar } from "./components/LanguageBar";
import { SupervisorShell } from "./components/SupervisorShell";
import { Login } from "./pages/Login";
import { GuardHome } from "./pages/guard/Home";
import { ScanPage } from "./pages/guard/Scan";
import { ReportPage } from "./pages/guard/Report";
import { LogDatabase } from "./pages/supervisor/Log";
import { Today } from "./pages/supervisor/Today";
import { Schedule } from "./pages/supervisor/Schedule";
import { ScanDetail } from "./pages/supervisor/ScanDetail";
import { Checkpoints } from "./pages/supervisor/Checkpoints";
import { Guards } from "./pages/supervisor/Guards";
import { MapView } from "./pages/supervisor/MapView";
import { More } from "./pages/supervisor/More";

/** The theme and language bar, except on supervisor pages (SupervisorShell has them). */
function PageLanguageBar() {
	const [location] = useLocation();
	return location.startsWith("/supervisor") ? null : <LanguageBar />;
}

/** Sends signed-out people to /login and each role to its own home. */
function RequireRole({
	role,
	children,
}: {
	role: Role;
	children: ComponentChildren;
}) {
	const { user } = useApp();
	if (!user) return <Redirect to="/login" />;
	if (user.role !== role)
		return (
			<Redirect to={user.role === "supervisor" ? "/supervisor" : "/"} />
		);
	return <>{children}</>;
}

// Hash routing (#/scan) works on any static host with zero server config.
// If you host on Netlify or Cloudflare Pages you can switch to normal paths plus a rewrite rule.
export function App() {
	const { user, t } = useApp();
	return (
		// oxlint-disable-next-line react/hooks -- wouter takes the location hook itself, by design
		<Router hook={useHashLocation}>
			<PageLanguageBar />
			<div class="flex-1 flex flex-col">
				<Switch>
					<Route path="/login">
						{user ? (
							<Redirect
								to={
									user.role === "supervisor"
										? "/supervisor"
										: "/"
								}
							/>
						) : (
							<Login />
						)}
					</Route>

					<Route path="/">
						<RequireRole role="guard">
							<GuardHome />
						</RequireRole>
					</Route>
					<Route path="/scan">
						<RequireRole role="guard">
							<ScanPage />
						</RequireRole>
					</Route>
					<Route path="/report/:scanId">
						{(p) => (
							<RequireRole role="guard">
								<ReportPage scanId={p.scanId} />
							</RequireRole>
						)}
					</Route>

					<Route path="/supervisor">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<Today />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/log">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<LogDatabase />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/schedule">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<Schedule />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/map">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<MapView />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/guards">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<Guards />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/checkpoints">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<Checkpoints />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/more">
						<RequireRole role="supervisor">
							<SupervisorShell>
								<More />
							</SupervisorShell>
						</RequireRole>
					</Route>
					<Route path="/supervisor/scans/:id">
						{(p) => (
							<RequireRole role="supervisor">
								<SupervisorShell>
									<ScanDetail id={p.id} />
								</SupervisorShell>
							</RequireRole>
						)}
					</Route>

					<Route>
						<p class="p-5">{t("notFound")}</p>
					</Route>
				</Switch>
			</div>
		</Router>
	);
}
