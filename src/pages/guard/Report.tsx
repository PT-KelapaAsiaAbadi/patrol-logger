/**
 * After a scan, the guard can add a report: a note and up to 5 photos, shrunk before upload.
 * With no signal the report waits in the outbox like a scan. Blue like the other guard screens
 * (index.css, "Report"); the sent screen reuses the scan result's layout.
 */
import { useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { useApp } from "../../state";
import * as api from "../../data/api";
import { compressImage } from "../../lib/image";
import { ICON, IconButton } from "../../components/IconButton";
import {
	ArrowLeft,
	Camera,
	Check,
	Images,
	CloudUpload,
	Send,
	Trash2,
} from "lucide-preact";

/**
 * Photo submission during report is limited to 5 unless changed in future updates.
 */
const MAX_PHOTOS = 5;

/**
 * The longest note: about 200 words (Indonesian words run about 6 to 7 letters plus a space).
 * The database accepts up to 4000 (reports.note).
 */
const NOTE_MAX = 1500;

/**
 * Guard-facing report submission page (after a scan).
 *
 * @param scanId the scan this report belongs to (from the route, #/report/:scanId)
 */
export function ReportPage({ scanId }: { scanId: string }) {
	const { t } = useApp();

	/**
	 * The note to be submitted with a report.
	 */
	const [note, setNote] = useState("");
	/**
	 * Photo submission is optional. Max=5.
	 */
	const [photos, setPhotos] = useState<string[]>([]);

	const [processing, setProcessing] = useState(false);
	const [busy, setBusy] = useState(false);

	const [problem, setProblem] = useState(false);
	const [result, setResult] = useState<"sent" | "queued" | null>(null);

	const name = api.checkpointNameForScan(scanId) ?? t("unknownCheckpoint");

	/**
	 * Handle file addition before submitting report.
	 * @param files
	 */
	async function addFiles(files: FileList | null) {
		if (!files?.length) return;
		setProcessing(true);

		const room = MAX_PHOTOS - photos.length;
		const picked = [...files].slice(0, room);

		// One at a time: decoding several 12 MP photos at once can crash a low-memory phone's tab.
		const out: string[] = [];
		for (const f of picked) {
			try {
				out.push(await compressImage(f));
			} catch {
				// TODO: tell the guard a photo couldn't be read; it's skipped silently for now.
				// See README > Status and TODO > Screens.
			}
		}
		setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
		setProcessing(false);
	}

	/**
	 * Send report after a scan.
	 */
	async function send() {
		if (!note.trim() && photos.length === 0) {
			setProblem(true);
			return;
		}
		setBusy(true);
		setResult(await api.addReport(scanId, note, photos));
		setBusy(false);
	}

	// Report sent, or saved to send later.
	if (result) {
		return (
			<main
				class="scan-done"
				aria-live="polite">
				<div class="scan-done-main">
					<span
						class={`scan-done-icon ${result === "sent" ? "is-done" : "is-queued"}`}>
						{result === "sent" ? (
							<Check
								size={52}
								strokeWidth={2.6}
								aria-hidden="true"
							/>
						) : (
							<CloudUpload
								size={48}
								aria-hidden="true"
							/>
						)}
					</span>
					<h1>{t(result === "sent" ? "reportSent" : "scanSaved")}</h1>
					<p class="scan-done-name">{name}</p>
					{result === "queued" && (
						<p class="text-muted">{t("scanSavedHint")}</p>
					)}
				</div>
				<div class="scan-done-actions">
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

	// Writing the report.
	return (
		<main class="report-page">
			<Link
				href="/"
				class="link-btn report-back">
				<ArrowLeft
					size={ICON}
					aria-hidden="true"
				/>
				{t("back")}
			</Link>
			<div>
				<h1>{t("addReport")}</h1>
				<p class="text-muted">{name}</p>
			</div>

			<section class="report-card">
				<div class="grid gap-1.5">
					<label
						for="report-note"
						class="report-label">
						{t("reportNote")}
					</label>
					<textarea
						id="report-note"
						class="field report-note"
						maxLength={NOTE_MAX}
						placeholder={t("reportNotePlaceholder")}
						aria-describedby="report-note-count"
						value={note}
						onInput={(e) => {
							setNote(e.currentTarget.value);
							setProblem(false);
						}}
					/>
					{/* Characters used, under the box on the right. */}
					<p
						class={`field-count ${note.length >= NOTE_MAX ? "is-full" : ""}`}
						aria-hidden="true">
						{note.length}/{NOTE_MAX}
					</p>
					<span
						id="report-note-count"
						class="sr-only">
						{t("charCount", { n: note.length, max: NOTE_MAX })}
					</span>
				</div>

				<fieldset class="report-photos-set">
					<legend class="report-photos-head">
						<span class="report-label">{t("photosOptional")}</span>
						<span class="report-photos-count">
							{t("photoCount", {
								n: photos.length,
								max: MAX_PHOTOS,
							})}
						</span>
					</legend>
					<ul class="report-photos">
						{/* Up to MAX_PHOTOS photos, from the camera or the gallery. Newer Android
						    opens a gallery-only picker for a plain file input, so the camera gets
						    its own tile (capture); iPhones offer both either way. */}
						{photos.length < MAX_PHOTOS && (
							<li>
								<label
									class={`photo-add ${processing ? "is-busy" : ""}`}>
									<Camera
										size={24}
										aria-hidden="true"
									/>
									{processing
										? t("processingPhotos")
										: t("takePhoto")}
									<input
										type="file"
										accept="image/*"
										capture="environment"
										class="sr-only"
										onChange={(e) => {
											void addFiles(
												e.currentTarget.files,
											);
											e.currentTarget.value = "";
										}}
									/>
								</label>
							</li>
						)}
						{photos.length < MAX_PHOTOS && (
							<li>
								<label
									class={`photo-add ${processing ? "is-busy" : ""}`}>
									<Images
										size={24}
										aria-hidden="true"
									/>
									{processing
										? t("processingPhotos")
										: t("fromGallery")}
									<input
										type="file"
										accept="image/*"
										multiple
										class="sr-only"
										onChange={(e) => {
											void addFiles(
												e.currentTarget.files,
											);
											e.currentTarget.value = "";
										}}
									/>
								</label>
							</li>
						)}
						{photos.map((src, i) => (
							<li key={i}>
								<img
									src={src}
									alt=""
								/>
								<IconButton
									icon={Trash2}
									class="icon-btn-danger photo-remove"
									label={t("removePhoto")}
									onClick={() =>
										setPhotos((p) =>
											p.filter((_, j) => j !== i),
										)
									}
								/>
							</li>
						))}
					</ul>
				</fieldset>
			</section>

			{problem && (
				<p
					class="notice notice-warn"
					role="alert">
					{t("reportEmpty")}
				</p>
			)}
			<button
				type="button"
				class="btn btn-primary btn-lg w-full"
				disabled={busy || processing}
				onClick={() => void send()}>
				<Send
					size={ICON}
					aria-hidden="true"
				/>
				{busy ? t("sending") : t("sendReport")}
			</button>
		</main>
	);
}
