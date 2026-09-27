/**
 * Shrinks a camera photo before upload. A 12 MP phone photo is 3 to 6 MB;
 * this brings it to roughly 150 to 300 KB, which matters on prepaid data and on Supabase's free storage.
 *
 * @param file The photo the guard picked or took, straight from the file input.
 * @param maxSide Longest edge (width or height) of the result, in pixels. Smaller photos keep their size.
 * @param quality JPEG quality from 0 to 1. 0.7 keeps text and faces readable at a fraction of the size.
 *
 * @returns The shrunk photo as a JPEG data URL, ready to store in the outbox and upload.
 *
 * @throws Error("image_decode_failed") if the browser can't read the file as an image,
 * 	or Error("canvas_unavailable") if the browser can't draw (very rare, e.g. out of memory).
 */
export async function compressImage(
	file: File,
	maxSide = 1280,
	quality = 0.7,
): Promise<string> {
	// A temporary address for the file, so an <img> can load it without copying the bytes.
	const url = URL.createObjectURL(file);
	try {
		// Wait for the browser to decode the photo. A file that isn't an image fails here.
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.addEventListener("load", () => resolve(el), { once: true });
			el.addEventListener(
				"error",
				() => reject(new Error("image_decode_failed")),
				{ once: true },
			);
			el.src = url; // set last, so both listeners are in place before loading starts
		});

		// Fit the longest side to maxSide, keeping the shape. Never enlarge a small photo (cap at 1).
		const scale = Math.min(
			1,
			maxSide / Math.max(img.naturalWidth, img.naturalHeight),
		);

		// Redraw at the new size on an off-screen canvas. Browsers apply the photo's rotation
		// here, and the photo's hidden details (EXIF, including where it was taken) are left behind.
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);

		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas_unavailable");
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		// Text, not a file, so it can sit in the offline outbox (IndexedDB) until there's signal.
		return canvas.toDataURL("image/jpeg", quality);
	} finally {
		// Free the full-size photo whether or not it worked. On a low-memory phone a few
		// unreleased 12 MP photos can crash the tab.
		URL.revokeObjectURL(url);
	}
}
