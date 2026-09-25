import { Link, useLocation } from "wouter-preact";
import { useEffect } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync, useOnline, useOutbox } from "../../hooks";
import * as api from "../../data/api";
import { formatTime } from "../../lib/format";

export function GuardHome() {
	const { t, lang, user, setUser } = useApp();
	const [, navigate] = useLocation();
	const online = useOnline();
	const outbox = useOutbox();
	const progress = useAsync(
		() => api.todayProgress(user!.id),
		[user!.id, online, outbox.items.length],
	);

	// Try to send anything waiting as soon as this screen opens.
	useEffect(() => {
		if (online) void api.flushOutbox();
	}, [online]);

	const route = progress.data?.route ?? [];
	const visits = progress.data?.visits ?? {};
	const done = route.filter((c) => visits[c.id]).length;
	const pendingScans = outbox.items.filter((i) => i.kind === "scan").length;

	return (
		<div class="min-h-full flex flex-col">
			<header class="flex items-center justify-between gap-3 px-5 py-3 border-b border-line bg-surface">
				<p class="font-semibold">{user!.name}</p>
				<button
					type="button"
					class="link-btn"
					onClick={() => {
						api.signOut();
						setUser(null);
						navigate("/login");
					}}>
					{t("signOut")}
				</button>
			</header>

			<main class="flex-1 px-5 pt-5 pb-32 max-w-xl w-full mx-auto">
				{!online && (
					<p class="notice notice-warn mb-4">{t("offline")}</p>
				)}
				{outbox.rejected > 0 && (
					<div class="notice notice-warn mb-4 flex items-start justify-between gap-3">
						<p>{t("rejectedScans", { n: outbox.rejected })}</p>
						<button
							type="button"
							class="link-btn shrink-0"
							onClick={api.clearRejected}>
							{t("dismiss")}
						</button>
					</div>
				)}

				<h1 class="text-xl font-bold leading-snug">
					{progress.data
						? t("roundToday", { done, total: route.length })
						: t("loading")}
				</h1>
				<div
					class="progress mt-3"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={route.length}
					aria-valuenow={done}>
					<span
						style={{
							width: route.length
								? `${(done / route.length) * 100}%`
								: "0%",
						}}
					/>
				</div>

				<ol class="route mt-5">
					{route.map((cp) => {
						const v = visits[cp.id];
						return (
							<li
								key={cp.id}
								class={
									v
										? v.queued
											? "is-queued"
											: "is-done"
										: ""
								}>
								<span class="stop tabular-nums">
									{cp.routeOrder}
								</span>
								<span class="flex-1">{cp.name}</span>
								<span class="status tabular-nums">
									{!v
										? t("notYet")
										: v.queued
											? t("waitingSignal")
											: t("checkedAt", {
													time: formatTime(
														v.at,
														lang,
													),
												})}
								</span>
							</li>
						);
					})}
				</ol>

				{pendingScans > 0 && (
					<p class="text-muted mt-4">
						{t("pendingSync", { n: pendingScans })}
					</p>
				)}
				{(progress.data?.unmatchedPending ?? 0) > 0 && (
					<p class="text-muted mt-1">
						{t("pendingUnmatched", {
							n: progress.data!.unmatchedPending,
						})}
					</p>
				)}
			</main>

			<div class="dock">
				<Link
					href="/scan"
					class="btn btn-primary btn-xl w-full">
					{t("scanCheckpoint")}
				</Link>
			</div>
		</div>
	);
}
