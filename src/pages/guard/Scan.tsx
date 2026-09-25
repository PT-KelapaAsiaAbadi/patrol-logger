import { useEffect, useRef, useState } from "preact/hooks";
import { Link, useLocation } from "wouter-preact";
import { useApp } from "../../state";
import * as api from "../../data/api";
import {
	startScanner,
	type ScannerError,
	type ScannerHandle,
} from "../../lib/scanner";
import { formatTime } from "../../lib/format";
import type { ScanOutcome } from "../../types";

type CameraState = "starting" | "running" | ScannerError;

export function ScanPage() {
	const { t, lang, user } = useApp();
	const [, navigate] = useLocation();
	const videoRef = useRef<HTMLVideoElement>(null);
	const handleRef = useRef<ScannerHandle | null>(null);
	// The camera reads the same sticker several times a second. While a scan is being sent, and
	// for good once one has succeeded, further reads are ignored: frames still being decoded when
	// the camera stops would otherwise record the same checkpoint a second time.
	const busyRef = useRef(false);

	const [camera, setCamera] = useState<CameraState>("starting");
	const [showManual, setShowManual] = useState(false);
	const [manual, setManual] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<"unknown_code" | "inactive" | null>(
		null,
	);
	const [outcome, setOutcome] = useState<Extract<
		ScanOutcome,
		{ ok: true }
	> | null>(null);

	async function submit(code: string) {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		setError(null);
		const r = await api.scan(code, user!.id);
		setBusy(false);
		if (!r.ok) {
			busyRef.current = false; // wrong code: keep scanning
			setError(r.reason);
			return;
		}
		// Success: busyRef stays set, so this page never records another scan.
		handleRef.current?.stop();
		handleRef.current = null;
		navigator.vibrate?.(80); // short buzz so the guard knows without looking
		setOutcome(r);
	}

	useEffect(() => {
		if (outcome) return;
		let cancelled = false;
		startScanner(videoRef.current!, (text) => void submit(text))
			.then((h) => {
				if (cancelled) h.stop();
				else {
					handleRef.current = h;
					setCamera("running");
				}
			})
			.catch((e: ScannerError) => {
				if (!cancelled) {
					setCamera(e);
					setShowManual(true);
				}
			});
		return () => {
			cancelled = true;
			handleRef.current?.stop();
			handleRef.current = null;
		};
	}, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

	if (outcome) {
		const name = outcome.checkpoint?.name ?? t("unknownCheckpoint");
		return (
			<main
				class="min-h-full flex flex-col px-5 pt-10 pb-8 max-w-xl mx-auto w-full"
				aria-live="polite">
				<p
					class={`result-tag ${outcome.queued ? "is-queued" : "is-done"}`}>
					{outcome.queued ? t("scanSaved") : t("scanLogged")}
				</p>
				<h1 class="text-3xl font-bold leading-tight mt-3">{name}</h1>
				<p class="text-lg tabular-nums mt-2">
					{formatTime(outcome.scan.scannedAt, lang)}
				</p>
				{outcome.queued && (
					<p class="text-muted mt-2">{t("scanSavedHint")}</p>
				)}

				<div class="mt-auto grid gap-3 pt-10">
					<Link
						href={`/report/${outcome.scan.id}`}
						class="btn btn-quiet btn-lg">
						{t("addReport")}
					</Link>
					<Link
						href="/"
						class="btn btn-primary btn-lg">
						{t("backToRound")}
					</Link>
				</div>
			</main>
		);
	}

	const cameraFailed = camera !== "starting" && camera !== "running";

	return (
		<main class="scan-screen">
			<div class="scan-view">
				<video
					ref={videoRef}
					muted
					playsInline
					class={cameraFailed ? "hidden" : ""}
				/>
				{!cameraFailed && (
					<div
						class="scan-frame"
						aria-hidden="true"
					/>
				)}
				{camera === "starting" && (
					<p class="scan-hint">{t("startingCamera")}</p>
				)}
			</div>

			<div class="scan-panel">
				{cameraFailed ? (
					<p class="notice notice-warn">{t(`camera_${camera}`)}</p>
				) : (
					<p>{t("aimCamera")}</p>
				)}
				{error && (
					<p
						class="notice notice-warn mt-3"
						role="alert">
						{t(error)}
					</p>
				)}

				{showManual ? (
					<form
						class="grid gap-3 mt-4"
						onSubmit={(e) => {
							e.preventDefault();
							if (manual.trim()) void submit(manual);
						}}>
						<label class="grid gap-1">
							<span class="font-medium">{t("codeLabel")}</span>
							<input
								class="field text-lg tracking-wider uppercase"
								autoCapitalize="characters"
								autoComplete="off"
								placeholder={t("codePlaceholder")}
								value={manual}
								onInput={(e) =>
									setManual(e.currentTarget.value)
								}
							/>
						</label>
						<button
							class="btn btn-primary btn-lg"
							disabled={busy || !manual.trim()}>
							{busy ? t("checking") : t("logScan")}
						</button>
					</form>
				) : (
					<button
						type="button"
						class="btn btn-quiet btn-lg w-full mt-4"
						onClick={() => setShowManual(true)}>
						{t("typeCode")}
					</button>
				)}
				<button
					type="button"
					class="btn btn-ghost w-full mt-2"
					onClick={() => navigate("/")}>
					{t("cancel")}
				</button>
			</div>
		</main>
	);
}
