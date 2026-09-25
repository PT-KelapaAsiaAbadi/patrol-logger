/** Saves a generated file with the standard Blob + <a download> approach. */
export function saveFile(filename: string, data: string, mime: string): void {
	const url = URL.createObjectURL(new Blob([data], { type: mime }));
	const a = Object.assign(document.createElement("a"), {
		href: url,
		download: filename,
	});
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
