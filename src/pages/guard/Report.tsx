/**
 * After a scan, the guard can add a report: a note and up to 5 photos, shrunk before upload.
 * With no signal the report waits in the outbox like a scan.
 */
import { useState } from "preact/hooks";
import { Link } from "wouter-preact";
import { useApp } from "../../state";
import * as api from "../../data/api";
import { compressImage } from "../../lib/image";
import { ICON, IconButton } from "../../components/IconButton";
import { ArrowLeft, ImagePlus, Send, Trash2 } from "lucide-preact";

/**
 * Photo submission during report is limited to 5 unless changed in future updates.
 */
const MAX_PHOTOS = 5;

/**
 * Guard-facing report submission page (after a scan).
 *
 * @param param0 scanId object -TODO
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
				/* skip unreadable file */
				// TODO: implement Error handling / catch handling
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

	// Report sent successfully.
	if (result) {
		return (
			<main
				class="min-h-full flex flex-col px-5 pt-10 pb-8 max-w-xl mx-auto w-full"
				aria-live="polite">
				<h1 class="text-2xl font-bold">
					{t(result === "sent" ? "reportSent" : "reportQueued")}
				</h1>
				<Link
					href="/"
					class="btn btn-primary btn-lg mt-auto">
					<ArrowLeft
						size={ICON}
						aria-hidden="true"
					/>
					{t("backToRound")}
				</Link>
			</main>
		);
	}

	// Sending unsuccessful.
	return (
		<main class="px-5 pt-6 pb-10 max-w-xl mx-auto w-full">
			<Link
				href="/"
				class="link-btn">
				<ArrowLeft
					size={ICON}
					aria-hidden="true"
				/>
				{t("back")}
			</Link>
			<h1 class="text-2xl font-bold mt-3 mb-5">
				{t("reportTitle", { name })}
			</h1>

			<label class="grid gap-1">
				<span class="font-medium">{t("reportNote")}</span>
				<textarea
					class="field min-h-32"
					placeholder={t("reportNotePlaceholder")}
					value={note}
					onInput={(e) => {
						setNote(e.currentTarget.value);
						setProblem(false);
					}}
				/>
			</label>

			<fieldset class="mt-6">
				<legend class="font-medium mb-2">
					{t("photos", { n: photos.length })}
				</legend>
				{photos.length > 0 && (
					<ul class="grid grid-cols-3 gap-2 mb-3">
						{photos.map((src, i) => (
							<li
								key={i}
								class="grid gap-1">
								<img
									src={src}
									alt=""
									class="aspect-square object-cover w-full border border-line"
								/>
								<IconButton
									icon={Trash2}
									class="icon-btn-danger justify-self-start"
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
				)}
				{/* limit photo submission to 5 */}
				{photos.length < MAX_PHOTOS && (
					<label
						class={`btn btn-quiet w-full ${processing ? "opacity-60 pointer-events-none" : ""}`}>
						<ImagePlus
							size={ICON}
							aria-hidden="true"
						/>
						{processing ? t("processingPhotos") : t("addPhotos")}
						<input
							type="file"
							accept="image/*"
							multiple
							class="sr-only"
							onChange={(e) => {
								void addFiles(e.currentTarget.files);
								e.currentTarget.value = "";
							}}
						/>
					</label>
				)}
			</fieldset>

			{problem && (
				<p
					class="notice notice-warn mt-4"
					role="alert">
					{t("reportEmpty")}
				</p>
			)}
			<button
				type="button"
				class="btn btn-primary btn-lg w-full mt-6"
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
