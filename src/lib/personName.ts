/**
 * Rules for a person's full name on an account: 1 to 70 characters after tidying spaces, starting
 * with a letter, and made only of letters, spaces and the punctuation names use (. , ' ’ -), e.g.
 * "Moh. Ma'ruf" or "Siti Nur-Aini". No digits or other symbols. Letters from any alphabet count.
 * Keep in step with supabase/functions/_shared/names.ts, which the server checks with.
 */

export const PERSON_NAME_MAX = 70;

export type PersonNameProblem =
	"personNameEmpty" | "personNameTooLong" | "personNameInvalid";

/** Trims and collapses runs of spaces, the way the account is saved. */
export const tidyPersonName = (name: string) =>
	name.trim().replace(/\s+/g, " ");

/** Drops characters a name can't contain while it's being typed or pasted. */
export const keepNameChars = (input: string) =>
	input.replace(/[^\p{L}\p{M} .,'’-]/gu, "").slice(0, PERSON_NAME_MAX);

/** What's wrong with a name, or null if it's fine. */
export function personNameProblem(name: string): PersonNameProblem | null {
	const tidy = tidyPersonName(name);
	if (!tidy) return "personNameEmpty";
	if (tidy.length > PERSON_NAME_MAX) return "personNameTooLong";
	if (!/^\p{L}[\p{L}\p{M} .,'’-]*$/u.test(tidy)) return "personNameInvalid";
	return null;
}
