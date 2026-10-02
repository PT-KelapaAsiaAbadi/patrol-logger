/**
 * Why a scan needs a supervisor's look, as a small yellow chip with an icon (rules in
 * lib/today.ts). Shared by Today's Needs review and the Log Database's Flags column.
 */
import type { LucideIcon } from "lucide-preact";
import {
	Clock,
	MapPin,
	MapPinOff,
	MessageSquareText,
	Timer,
} from "lucide-preact";
import { useApp } from "../state";
import type { ReviewReason } from "../lib/today";

export const REASON_ICON: Record<ReviewReason, LucideIcon> = {
	reasonFar: MapPin,
	reasonNoGps: MapPinOff,
	reasonReport: MessageSquareText,
	reasonLate: Clock,
	reasonTooFast: Timer,
};

export function ReasonChip({ reason }: { reason: ReviewReason }) {
	const { t } = useApp();
	const Icon = REASON_ICON[reason];
	return (
		<span class="reason-chip">
			<Icon
				size={13}
				aria-hidden="true"
			/>
			{t(reason)}
		</span>
	);
}
