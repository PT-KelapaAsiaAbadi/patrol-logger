import { Link, useLocation } from "wouter-preact";
import { useEffect } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync, useOnline, useOutbox } from "../../hooks";
import * as api from "../../data/api";
import { formatTime } from "../../lib/format";
import { ICON, IconButton } from "../../components/IconButton";
import {
	CircleCheck,
	LogOut,
	RotateCcw,
	ScanLine,
	Trash2,
	X,
} from "lucide-preact";

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
	const pendingScans = outbox.items.filter(
		(i) => i.kind === "scan" && i.scan.guardId === user!.id && !i.error,
	).length;
	const failed = api.failedItems(user!.id);

	return (
		<div class="min-h-full flex flex-col">
			<header class="flex items-center justify-between gap-3 px-5 py-3 border-b border-line bg-surface">
				<p class="font-semibold">{user!.name}</p>
				<button
					type="button"
					class="link-btn"
					onClick={() => {
						// Unsent items stay on this phone and only go out when this guard signs in again.
						const unsent = api.unsentCount(user!.id);
						if (
							unsent > 0 &&
							!confirm(t("signOutUnsent", { n: unsent }))
						)
							return;
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
			</header>

			<main class="flex-1 px-5 pt-5 pb-32 max-w-xl w-full mx-auto">
				{!online && (
					<p class="notice notice-warn mb-4">{t("offline")}</p>
				)}
				{outbox.rejected > 0 && (
					<div class="notice notice-warn mb-4 flex items-start justify-between gap-3">
						<p>{t("rejectedScans", { n: outbox.rejected })}</p>
						<IconButton
							icon={X}
							label={t("dismiss")}
							class="shrink-0"
							onClick={api.clearRejected}
						/>
					</div>
				)}

				{failed.length > 0 && (
					<div
						class="notice notice-warn mb-4"
						role="alert">
						<p>{t("sendFailed", { n: failed.length })}</p>
						<p class="text-sm mt-1">
							{t("sendFailedReason", {
								reason: failed[0].error!,
							})}
						</p>
						<div class="flex flex-wrap gap-x-5 gap-y-1 mt-2">
							<button
								type="button"
								class="link-btn"
								disabled={!online}
								onClick={() => void api.retryFailed()}>
								<RotateCcw
									size={ICON}
									aria-hidden="true"
								/>
								{t("retry")}
							</button>
							<button
								type="button"
								class="link-btn"
								onClick={() => {
									if (
										confirm(
											t("discardConfirm", {
												n: failed.length,
											}),
										)
									)
										api.discardFailed(user!.id);
								}}>
								<Trash2
									size={ICON}
									aria-hidden="true"
								/>
								{t("discard")}
							</button>
						</div>
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
								<span class="status tabular-nums inline-flex items-center justify-end gap-1">
									{v && !v.queued && (
										<CircleCheck
											size={ICON}
											aria-hidden="true"
										/>
									)}
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
					<ScanLine
						size={ICON}
						aria-hidden="true"
					/>
					{t("scanCheckpoint")}
				</Link>
			</div>
		</div>
	);
}
