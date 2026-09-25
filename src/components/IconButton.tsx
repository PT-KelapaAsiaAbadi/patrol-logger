import type { JSX } from "preact";
import { Link } from "wouter-preact";
import type { LucideIcon } from "lucide-preact";

/** Icon size used everywhere, so icons line up with 16px text. */
export const ICON = 18;

type Common = {
	icon: LucideIcon;
	/** What the button does, for screen readers. Can include context, e.g. which checkpoint. */
	label: string;
	/** The hover and focus help text. Defaults to the label. */
	tip?: string;
	class?: string;
};

/** A button that's only an icon. The label is its accessible name and its tooltip. */
export function IconButton({
	icon: Icon,
	label,
	tip = label,
	class: cls = "",
	...rest
}: Common & Omit<JSX.IntrinsicElements["button"], "icon" | "label">) {
	return (
		<button
			type="button"
			{...rest}
			class={`icon-btn ${cls}`}
			aria-label={label}
			data-tip={tip}>
			<Icon
				size={ICON}
				aria-hidden="true"
			/>
		</button>
	);
}

/** A link that's only an icon, for in-app routes. */
export function IconLink({
	icon: Icon,
	label,
	tip = label,
	class: cls = "",
	href,
}: Common & { href: string }) {
	return (
		<Link
			href={href}
			class={`icon-btn ${cls}`}
			aria-label={label}
			data-tip={tip}>
			<Icon
				size={ICON}
				aria-hidden="true"
			/>
		</Link>
	);
}
