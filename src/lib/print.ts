let frame: HTMLIFrameElement | null = null;

/** Opens the print dialog for a standalone HTML document, via a hidden iframe so no pop-up is needed. */
export function printDocument(html: string): void {
	frame?.remove();
	const f = document.createElement("iframe");
	f.title = "print";
	f.style.cssText =
		"position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
	f.srcdoc = html;
	f.addEventListener(
		"load",
		() => {
			const w = f.contentWindow;
			if (!w) return;
			w.addEventListener("afterprint", () => f.remove());
			w.focus();
			w.print();
		},
		{ once: true },
	);
	document.body.append(f);
	frame = f;
}
