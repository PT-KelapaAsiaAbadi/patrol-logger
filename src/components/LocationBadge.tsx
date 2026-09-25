import { useApp } from "../state";
import { formatDistance } from "../lib/format";
import type { Scan } from "../types";

/** How a scan's GPS position compared with its checkpoint, for the supervisor's screens. */
export function LocationBadge({
	scan,
}: {
	scan: Pick<Scan, "locationStatus" | "distanceM">;
}) {
	const { t, lang } = useApp();
	switch (scan.locationStatus) {
		case "ok":
			return <span class="loc-ok">{t("locStatus_ok")}</span>;
		case "far":
			return (
				<span class="loc-far">
					{t("locStatus_far", {
						d: formatDistance(scan.distanceM ?? 0, lang),
					})}
				</span>
			);
		case "no_fix":
			return <span class="text-muted">{t("locStatus_no_fix")}</span>;
		default:
			return <span class="text-muted">{t("locStatus_not_set")}</span>;
	}
}

/** Link to a point on openstreetmap.org, with a marker. */
export const mapLink = (lat: number, lng: number) =>
	`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`;
