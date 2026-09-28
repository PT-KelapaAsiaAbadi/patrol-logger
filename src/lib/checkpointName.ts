/**
 * Rules for checkpoint names, shared by "Add a checkpoint" and renaming in the round table.
 *
 * 3 to 50 characters after tidying spaces: long enough to mean something, short enough to fit two
 * lines on the printed sticker (13 pt on a 55 mm label) and one line in the guard's round. That is
 * roughly 6 to 8 words; a word limit isn't needed on top. The database allows up to 80, so names
 * made before this rule still load and can be kept.
 */

export const CHECKPOINT_NAME_MIN = 3;
export const CHECKPOINT_NAME_MAX = 50;

export type CheckpointNameProblem =
	"nameTooShort" | "nameTooLong" | "nameNoLetters" | "nameDuplicate";

/** Trims and collapses runs of spaces, the way the database stores names. */
export const tidyCheckpointName = (name: string) =>
	name.trim().replace(/\s+/g, " ");

/**
 * What's wrong with a name, or null if it's fine. `others` are the checkpoints already in the
 * round; `selfId` skips the one being renamed. Duplicates are compared ignoring case, because two
 * checkpoints called "Lobi utama" and "lobi Utama" would confuse guards.
 */
export function checkpointNameProblem(
	name: string,
	others: { id: string; name: string }[],
	selfId?: string,
): CheckpointNameProblem | null {
	const tidy = tidyCheckpointName(name);
	if (tidy.length < CHECKPOINT_NAME_MIN) return "nameTooShort";
	if (tidy.length > CHECKPOINT_NAME_MAX) return "nameTooLong";
	if (!/[\p{L}\p{N}]/u.test(tidy)) return "nameNoLetters";
	const key = tidy.toLocaleLowerCase();
	if (
		others.some(
			(c) =>
				c.id !== selfId &&
				tidyCheckpointName(c.name).toLocaleLowerCase() === key,
		)
	)
		return "nameDuplicate";
	return null;
}
