// @ts-check
/** Flags the server attaches to scans and reports, and how they are explained to supervisors. */

export const Flag = Object.freeze({
  BAD_CODE: 'BAD_CODE',
  NO_GPS: 'NO_GPS',
  REPLAYED: 'REPLAYED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  IMPOSSIBLE_TRAVEL: 'IMPOSSIBLE_TRAVEL',
  SAME_TIME_AS_OTHER_GUARD: 'SAME_TIME_AS_OTHER_GUARD',
  IDENTICAL_POSITION: 'IDENTICAL_POSITION',
  MISSING_SCANS: 'MISSING_SCANS',
  CHAIN_BROKEN: 'CHAIN_BROKEN',
  PHONE_CLOCK_AHEAD: 'PHONE_CLOCK_AHEAD',
  LOW_ACCURACY: 'LOW_ACCURACY',
  DUPLICATE: 'DUPLICATE',
  LATE_SYNC: 'LATE_SYNC',
  NO_GEOFENCE: 'NO_GEOFENCE',
  CALIBRATED: 'CALIBRATED',
  OLD_REPORT_PHOTO: 'OLD_REPORT_PHOTO',
  REUSED_REPORT_PHOTO: 'REUSED_REPORT_PHOTO',
});

/** @type {Readonly<Record<string, string>>} */
export const FLAG_DESCRIPTIONS = Object.freeze({
  [Flag.BAD_CODE]: 'Scanned a code that is not valid now, usually an old printed code or a copy.',
  [Flag.NO_GPS]: 'No location was sent.',
  [Flag.REPLAYED]: 'This scan had already been received, or arrived out of order.',
  [Flag.OUT_OF_RANGE]: 'The phone was outside the checkpoint area.',
  [Flag.IMPOSSIBLE_TRAVEL]: 'Too far from the previous scan for the time between them.',
  [Flag.SAME_TIME_AS_OTHER_GUARD]:
    'Another guard scanned this checkpoint within a minute. One person may be carrying two phones.',
  [Flag.IDENTICAL_POSITION]:
    'Exactly the same GPS position as an earlier scan. Real GPS drifts; fake-location apps often do not.',
  [Flag.MISSING_SCANS]:
    'Scans from this phone are missing from its sequence. Some may have been deleted before upload.',
  [Flag.CHAIN_BROKEN]: "This phone's record does not follow on from its previous scan.",
  [Flag.PHONE_CLOCK_AHEAD]: "The phone's clock was ahead of the server.",
  [Flag.LOW_ACCURACY]: 'GPS signal was weak.',
  [Flag.DUPLICATE]: 'The same checkpoint was scanned again within a few minutes.',
  [Flag.LATE_SYNC]: 'Uploaded late, after waiting on the phone without signal.',
  [Flag.NO_GEOFENCE]: 'This checkpoint has no location set, so distance was not checked.',
  [Flag.CALIBRATED]: "The checkpoint's location was set from this supervisor's scan.",
  [Flag.OLD_REPORT_PHOTO]: 'A report photo was taken well before the scan, so it may not be from this visit.',
  [Flag.REUSED_REPORT_PHOTO]: 'A report photo is identical to an earlier one, so it is not from this visit.',
});

/**
 * Flags that point to cheating. The rest are shown as minor.
 * @type {Set<string>}
 */
const REVIEW_FLAGS = new Set([
  Flag.BAD_CODE,
  Flag.NO_GPS,
  Flag.REPLAYED,
  Flag.OUT_OF_RANGE,
  Flag.IMPOSSIBLE_TRAVEL,
  Flag.SAME_TIME_AS_OTHER_GUARD,
  Flag.IDENTICAL_POSITION,
  Flag.MISSING_SCANS,
  Flag.CHAIN_BROKEN,
  Flag.PHONE_CLOCK_AHEAD,
]);

/** @param {import('../types.js').LogEntry} entry */
export function needsReview(entry) {
  return entry.result === 'REJECTED' || entry.flags.some((flag) => REVIEW_FLAGS.has(flag));
}

/** @param {import('../types.js').LogEntry} entry */
export function hasOnlyMinorFlags(entry) {
  return entry.result === 'ACCEPTED' && entry.flags.length > 0 && !needsReview(entry);
}
