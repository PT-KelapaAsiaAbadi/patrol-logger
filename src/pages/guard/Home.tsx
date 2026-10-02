/**
 * The guard's home screen (phones only): a greeting, today's progress with the next checkpoint,
 * the round with each checkpoint ticked once scanned, the Scan button, and anything still waiting
 * to send, with Try again and Discard for scans the server refused. Blue like the supervisor
 * pages (index.css, .guard-home); amber is kept for warnings.
 */
import { Link, useLocation } from "wouter-preact";
import { useEffect } from "preact/hooks";
import { useApp } from "../../state";
import { useAsync, useOnline, useOutbox } from "../../hooks";
import * as api from "../../data/api";
import { formatLongDate, formatTime, localDateKey } from "../../lib/format";
import { ICON, IconButton } from "../../components/IconButton";
import {
	Check,
	CircleCheck,
	Clock,
	CloudUpload,
	LogOut,
	MapPin,
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
	// The first stop in round order that hasn't been scanned (or saved to send) yet.
	const next = route.find((c) => !visits[c.id]);
	const pendingScans = outbox.items.filter(
		(i) => i.kind === "scan" && i.scan.guardId === user!.id && !i.error,
	).length;
	const failed = api.failedItems(user!.id);
	const firstName = user!.name.trim().split(/\s+/)[0];

	function signOut() {
		// Unsent items stay on this phone and only go out when this guard signs in again.
		const unsent = api.unsentCount(user!.id);
		if (unsent > 0 && !confirm(t("signOutUnsent", { n: unsent }))) return;
		api.signOut();
		setUser(null);
		navigate("/login");
	}

	return (
		<div class="guard-home min-h-full flex flex-col">
			<main class="flex-1 px-4 pt-5 pb-32 max-w-xl w-full mx-auto grid gap-4 content-start">
				<div class="guard-greet">
					<div class="min-w-0">
						<h1>{t("hello", { name: firstName })}</h1>
						<p class="text-muted">
							{formatLongDate(localDateKey(), lang)}
						</p>
					</div>
					<IconButton
						icon={LogOut}
						label={t("signOut")}
						class="shrink-0"
						onClick={signOut}
					/>
				</div>

				{!online && <p class="notice notice-warn">{t("offline")}</p>}
				{outbox.rejected > 0 && (
					<div class="notice notice-warn flex items-start justify-between gap-3">
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
						class="notice notice-warn"
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

				<section class="round-card">
					<p
						id="round-count"
						class="round-count">
						{progress.data ? (
							<>
								<span class="round-num">{done}</span>{" "}
								{t("roundOf", { total: route.length })}
							</>
						) : (
							t("loading")
						)}
					</p>
					{route.length > 0 && (
						<div
							class="round-bar"
							role="progressbar"
							aria-labelledby="round-count"
							aria-valuemin={0}
							aria-valuemax={route.length}
							aria-valuenow={done}>
							<span
								style={{
									width: `${(done / route.length) * 100}%`,
								}}
							/>
						</div>
					)}
					{next ? (
						<p class="round-next">
							<MapPin
								size={22}
								aria-hidden="true"
							/>
							<span class="min-w-0">
								<span class="round-next-label">
									{t("nextCheckpoint")}
								</span>
								<span class="round-next-name">{next.name}</span>
							</span>
						</p>
					) : (
						route.length > 0 && (
							<p class="round-next is-complete">
								<CircleCheck
									size={22}
									aria-hidden="true"
								/>
								{t("roundComplete")}
							</p>
						)
					)}
				</section>

				<section
					class="round-list"
					aria-labelledby="round-list-h">
					<h2
						id="round-list-h"
						class="round-list-head">
						{t("roundList")}
					</h2>
					<ol class="route">
						{route.map((cp) => {
							const v = visits[cp.id];
							const Icon = !v
								? Clock
								: v.queued
									? CloudUpload
									: Check;
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
									<span class="stop">
										<Icon
											size={16}
											strokeWidth={2.6}
											aria-hidden="true"
										/>
									</span>
									<span class="name">{cp.name}</span>
									<span class="status">
										{!v ? (
											t("notYet")
										) : v.queued ? (
											t("waitingSignal")
										) : (
											<>
												<span class="sr-only">
													{t("checked")}{" "}
												</span>
												{formatTime(v.at, lang)}
											</>
										)}
									</span>
								</li>
							);
						})}
					</ol>
				</section>

				{(pendingScans > 0 ||
					(progress.data?.unmatchedPending ?? 0) > 0) && (
					<div class="text-muted">
						{pendingScans > 0 && (
							<p>{t("pendingSync", { n: pendingScans })}</p>
						)}
						{(progress.data?.unmatchedPending ?? 0) > 0 && (
							<p class="mt-1">
								{t("pendingUnmatched", {
									n: progress.data!.unmatchedPending,
								})}
							</p>
						)}
					</div>
				)}
			</main>

			<div class="dock">
				<Link
					href="/scan"
					class="btn btn-primary btn-xl w-full">
					<ScanLine
						size={24}
						aria-hidden="true"
					/>
					{t("scanCheckpoint")}
				</Link>
			</div>
		</div>
	);
}
