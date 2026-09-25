import type { ComponentChildren } from "preact";
import { Redirect, Route, Router, Switch } from "wouter-preact";
import { useHashLocation } from "wouter-preact/use-hash-location";
import { useApp } from "./state";
import type { Role } from "./types";
import { LanguageBar } from "./components/LanguageBar";
import { SupervisorShell } from "./components/SupervisorShell";
import { Login } from "./pages/Login";
import { GuardHome } from "./pages/guard/Home";
import { ScanPage } from "./pages/guard/Scan";
import { ReportPage } from "./pages/guard/Report";
import { SupervisorLog } from "./pages/supervisor/Log";
import { ScanDetail } from "./pages/supervisor/ScanDetail";
import { Checkpoints } from "./pages/supervisor/Checkpoints";
import { Guards } from "./pages/supervisor/Guards";

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
		<Router hook={useHashLocation}>
			<LanguageBar />
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
								<SupervisorLog />
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
