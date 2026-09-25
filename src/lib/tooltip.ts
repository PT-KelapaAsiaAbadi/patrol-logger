/**
 * One tooltip for the whole app. Any element with a data-tip attribute shows it on mouse hover or
 * keyboard focus. It's fixed-position on the page, so tables that scroll sideways can't clip it.
 * Touch taps don't show it (there's no hover on a phone); icon-only buttons still have an
 * aria-label for screen readers.
 */
export function startTooltips() {
	const tip = document.createElement("div");
	tip.className = "tooltip";
	tip.setAttribute("role", "tooltip");
	tip.hidden = true;
	document.body.append(tip);
	let current: HTMLElement | null = null;

	function show(el: HTMLElement) {
		current = el;
		tip.textContent = el.dataset.tip ?? "";
		tip.hidden = false;
		const r = el.getBoundingClientRect();
		const t = tip.getBoundingClientRect();
		const gap = 6;
		// Above the element, or below it when there's no room above.
		const top =
			r.top - t.height - gap >= 4
				? r.top - t.height - gap
				: r.bottom + gap;
		const left = Math.min(
			Math.max(4, r.left + r.width / 2 - t.width / 2),
			window.innerWidth - t.width - 4,
		);
		tip.style.top = `${top}px`;
		tip.style.left = `${left}px`;
	}

	function hide() {
		current = null;
		tip.hidden = true;
	}

	const tipped = (target: EventTarget | null) =>
		target instanceof Element
			? target.closest<HTMLElement>("[data-tip]")
			: null;

	document.addEventListener("pointerover", (e) => {
		if (e.pointerType === "touch") return;
		const el = tipped(e.target);
		if (!el) hide();
		else if (el !== current) show(el);
	});
	document.addEventListener("pointerleave", hide);
	document.addEventListener("focusin", (e) => {
		const el = tipped(e.target);
		if (el?.matches(":focus-visible")) show(el);
	});
	document.addEventListener("focusout", hide);
	// Whatever was clicked may be about to disappear (a dialog closing, a row re-rendering).
	document.addEventListener("pointerdown", hide);
	document.addEventListener("keydown", (e) => e.key === "Escape" && hide());
	window.addEventListener("scroll", hide, true);
}
