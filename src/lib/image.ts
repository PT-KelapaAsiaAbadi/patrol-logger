/**
 * Shrinks a camera photo before upload. A 12 MP phone photo is 3 to 6 MB;
 * this brings it to roughly 150 to 300 KB, which matters on prepaid data and on Supabase's free storage.
 */
export async function compressImage(
	file: File,
	maxSide = 1280,
	quality = 0.7,
): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error("image_decode_failed"));
			el.src = url;
		});
		
    const scale = Math.min(
			1,
			maxSide / Math.max(img.naturalWidth, img.naturalHeight),
		);
		
    const canvas = document.createElement("canvas");
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);
		
    const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("canvas_unavailable");
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		
    return canvas.toDataURL("image/jpeg", quality);
	} finally {
		URL.revokeObjectURL(url);
	}
}
