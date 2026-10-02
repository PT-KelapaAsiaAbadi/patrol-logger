/**
 * The scan screen: opens the back camera, reads a checkpoint's QR sticker (or takes a typed manual
 * code), attaches the phone's GPS position and records exactly one scan. Works with no signal.
 * Then a result screen: logged (or saved on the phone), where, and the next checkpoint.
 * Blue like the guard's home screen (index.css, "Scanner").
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { Link, useLocation } from "wouter-preact";
import { useApp } from "../../state";
import * as api from "../../data/api";
import {
	startScanner,
	type ScannerError,
	type ScannerHandle,
} from "../../lib/scanner";
import {
	formatDistance,
	formatLongDate,
	formatTime,
	localDateKey,
} from "../../lib/format";
import {
	watchLocation,
	type LocationState,
	type LocationWatch,
} from "../../lib/geo";
import type { ScanOutcome } from "../../types";
import { ICON, IconButton } from "../../components/IconButton";
import {
	ArrowLeft,
	Check,
	CircleCheck,
	CloudUpload,
	FilePlus,
	Flashlight,
	FlashlightOff,
	Keyboard,
	MapPin,
	MapPinOff,
	RotateCcw,
	X,
} from "lucide-preact";

type CameraState = "starting" | "running" | ScannerError;

const LOCATION_TEXT = {
	finding: "locFinding",
	slow: "locSlow",
	off: "locOff",
	device_off: "locDeviceOff",
	insecure: "locInsecure",
} as const;

/**
 * Guard-facing QR-scanning screen.
 */
export function ScanPage() {
	const { t, lang, user } = useApp();
	const [, navigate] = useLocation();

	// "Scanning" is done by taking frames of during video and finding a frame where
	// the QR-code is decodable.

	const videoRef = useRef<HTMLVideoElement>(null);
	const handleRef = useRef<ScannerHandle | null>(null);
	const geoRef = useRef<LocationWatch | null>(null);

	// Location is recorded - where the scan was done (which could differ from actual checkpoint location).
	const [location, setLocation] = useState<LocationState>({
		kind: "finding",
	});

	// The camera reads the same QR-code sticker several times a second. While a scan is being sent, and
	// for good once one has succeeded, further reads are ignored: frames still being decoded when
	// the camera stops would otherwise record the same checkpoint a second time.
	const busyRef = useRef(false);

	const [camera, setCamera] = useState<CameraState>("starting");
	// The flashlight: null until the camera runs; "unsupported" where the browser can't switch it.
	const [flash, setFlash] = useState<"unsupported" | "off" | "on" | null>(
		null,
	);

	async function toggleFlash() {
		const h = handleRef.current;
		if (!h || flash === "unsupported" || flash === null) return;
		const on = flash === "off";
		try {
			await h.setFlash(on);
			setFlash(on ? "on" : "off");
		} catch {
			setFlash("unsupported");
		}
	}

	const [showManual, setShowManual] = useState(false);
	const [manual, setManual] = useState("");

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<
		"unknown_code" | "inactive" | "server_error" | null
	>(null);

	const [outcome, setOutcome] = useState<Extract<
		ScanOutcome,
		{ ok: true }
	> | null>(null);

	// After a scan: the next checkpoint in the round (null when the round is done; undefined
	// until known). Comes from today's progress, which works offline from the phone's copy.
	const [next, setNext] = useState<string | null | undefined>(undefined);
	useEffect(() => {
		if (!outcome) return;
		let cancelled = false;
		api.todayProgress(user!.id)
			.then((p) => {
				if (!cancelled)
					setNext(p.route.find((c) => !p.visits[c.id])?.name ?? null);
			})
			.catch(() => {}); // no next checkpoint shown: the rest of the screen still works
		return () => {
			cancelled = true;
		};
	}, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

	/**
	 * Submit a scan of the QR-code sticker.
	 *
	 * @param code the decoded QR-code.
	 */
	async function submit(code: string) {
		if (busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		setError(null);

		const r = await api.scan(code, user!.id, geoRef.current?.latest());
		setBusy(false);
		if (!r.ok) {
			busyRef.current = false; // wrong code: keep scanning
			setError(r.reason);
			return;
		}
		// Success: busyRef stays set, so this page never records another scan.
		handleRef.current?.stop();
		handleRef.current = null;
		navigator.vibrate?.(80); // short buzz/vibration so the guard knows without looking
		setOutcome(r);
	}

	// GPS starts with the screen, so a position is usually ready when the sticker is read.
	useEffect(() => {
		const watch = watchLocation(setLocation);
		geoRef.current = watch;
		return () => watch.stop();
	}, []);

	useEffect(() => {
		if (outcome) return;
		let cancelled = false;
		startScanner(videoRef.current!, (text) => void submit(text))
			.then((h) => {
				if (cancelled) h.stop();
				else {
					handleRef.current = h;
					setCamera("running");
					void h.hasFlash().then((ok) => {
						if (!cancelled) setFlash(ok ? "off" : "unsupported");
					});
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
		// Only a scan the server has seen has a location result.
		const status = outcome.queued ? null : outcome.scan.locationStatus;
		return (
			<main
				class="scan-done"
				aria-live="polite">
				<div class="scan-done-main">
					<span
						class={`scan-done-icon ${outcome.queued ? "is-queued" : "is-done"}`}>
						{outcome.queued ? (
							<CloudUpload
								size={48}
								aria-hidden="true"
							/>
						) : (
							<Check
								size={52}
								strokeWidth={2.6}
								aria-hidden="true"
							/>
						)}
					</span>
					<h1>{outcome.queued ? t("scanSaved") : t("scanLogged")}</h1>
					<p class="scan-done-name">{name}</p>
					<p class="text-muted tabular-nums">
						{formatTime(outcome.scan.scannedAt, lang)}
						{" · "}
						{formatLongDate(
							localDateKey(outcome.scan.scannedAt),
							lang,
						)}
					</p>
					{outcome.queued ? (
						<p class="text-muted">{t("scanSavedHint")}</p>
					) : status === "far" ? (
						<p
							class="notice notice-warn text-left"
							role="alert">
							{t("scanFar", {
								d: formatDistance(
									outcome.scan.distanceM ?? 0,
									lang,
								),
							})}
						</p>
					) : status === "ok" || status === "no_fix" ? (
						<p
							class={`loc-pill ${status === "ok" ? "is-ok" : "is-pending"}`}>
							{status === "ok" ? (
								<MapPin
									size={16}
									aria-hidden="true"
								/>
							) : (
								<MapPinOff
									size={16}
									aria-hidden="true"
								/>
							)}
							{t(`locStatus_${status}`)}
						</p>
					) : null}
				</div>

				<div class="scan-done-actions">
					{next !== undefined &&
						(next ? (
							<p class="scan-next">
								<span class="scan-next-label">
									{t("nextCheckpoint")}
								</span>
								<span class="scan-next-name">{next}</span>
							</p>
						) : (
							<p class="scan-next is-complete">
								<CircleCheck
									size={20}
									aria-hidden="true"
								/>
								{t("roundComplete")}
							</p>
						))}
					<Link
						href={`/report/${outcome.scan.id}`}
						class="btn btn-outline btn-lg">
						<FilePlus
							size={ICON}
							aria-hidden="true"
						/>
						{t("addReport")}
					</Link>
					<Link
						href="/"
						class="btn btn-primary btn-lg">
						<ArrowLeft
							size={ICON}
							aria-hidden="true"
						/>
						{t("backToRound")}
					</Link>
				</div>
			</main>
		);
	}

	const cameraFailed = camera !== "starting" && camera !== "running";
	const locTone =
		location.kind === "found"
			? "is-ok"
			: location.kind === "finding"
				? "is-pending"
				: "is-warn";

	return (
		<main class="scan-screen">
			<header class="scan-top">
				<IconButton
					icon={X}
					label={t("closeScanner")}
					class="icon-btn-lg"
					onClick={() => navigate("/")}
				/>
				<h1>{t("scanCheckpoint")}</h1>
				{flash === null ? (
					// Keeps the title centred until the camera is running.
					<span aria-hidden="true" />
				) : (
					<IconButton
						icon={flash === "on" ? FlashlightOff : Flashlight}
						label={
							flash === "unsupported"
								? t("flashUnavailable")
								: t("flashlight")
						}
						class={`icon-btn-lg flash-btn ${flash === "on" ? "is-on" : ""}`}
						aria-pressed={
							flash === "unsupported" ? undefined : flash === "on"
						}
						disabled={flash === "unsupported"}
						onClick={() => void toggleFlash()}
					/>
				)}
			</header>

			{/* The whole camera picture shows; the frame only marks where to hold the sticker. */}
			<div class={`scan-view ${cameraFailed ? "hidden" : ""}`}>
				<video
					ref={videoRef}
					muted
					playsInline
				/>
				<div
					class="scan-frame"
					aria-hidden="true">
					<span class="corner tl" />
					<span class="corner tr" />
					<span class="corner bl" />
					<span class="corner br" />
					<span class="scan-line" />
				</div>
				{camera === "starting" && (
					<p class="scan-hint">{t("startingCamera")}</p>
				)}
			</div>

			<div class="scan-body">
				{cameraFailed ? (
					<p class="notice notice-warn self-stretch">
						{t(`camera_${camera}`)}
					</p>
				) : (
					<>
						<p class="scan-aim">{t("aimCamera")}</p>
						<p class="scan-help">{t("cameraHelp")}</p>
					</>
				)}
				<p
					class={`loc-pill scan-loc ${locTone}`}
					aria-live="polite">
					{location.kind === "found" ||
					location.kind === "finding" ? (
						<MapPin
							size={16}
							aria-hidden="true"
						/>
					) : (
						<MapPinOff
							size={16}
							aria-hidden="true"
						/>
					)}
					<span>
						{location.kind === "found"
							? t("locFound", { m: location.accuracyM })
							: t(LOCATION_TEXT[location.kind])}{" "}
						{(location.kind === "off" ||
							location.kind === "device_off" ||
							location.kind === "slow") && (
							<button
								type="button"
								class="link-btn"
								onClick={() => geoRef.current?.retry()}>
								<RotateCcw
									size={ICON}
									aria-hidden="true"
								/>
								{t("retry")}
							</button>
						)}
					</span>
				</p>
				{error && (
					<p
						class="notice notice-warn self-stretch"
						role="alert">
						{t(error)}
					</p>
				)}

				{showManual ? (
					<form
						class="grid gap-3 self-stretch"
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
							<Check
								size={ICON}
								aria-hidden="true"
							/>
							{busy ? t("checking") : t("logScan")}
						</button>
					</form>
				) : (
					<button
						type="button"
						class="btn btn-quiet btn-lg self-stretch"
						onClick={() => setShowManual(true)}>
						<Keyboard
							size={ICON}
							aria-hidden="true"
						/>
						{t("typeCode")}
					</button>
				)}
			</div>
		</main>
	);
}
