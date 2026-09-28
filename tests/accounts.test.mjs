// Account input rules: phone numbers and full names. Pure functions, no database: run with
// --experimental-strip-types so the TypeScript modules load directly. (The guard CSV import is
// checked in e2e.test.mjs: csv.ts imports other modules, which Node can't load without a bundler.)
const { normalizePhone, keepPhoneChars } = await import("../src/lib/phone.ts");
const { personNameProblem, keepNameChars, tidyPersonName } =
	await import("../src/lib/personName.ts");
const { reporter } = await import("./local-supabase.mjs");
const { ok, section, done } = reporter();

section("phone numbers");
{
	const cases = [
		// [typed, expected stored form or null, why]
		["0812-3456-7890", "6281234567890", "12-digit local mobile"],
		["0811-1234-567", "628111234567", "11-digit local mobile"],
		["0812-1234-56789", "62812123456789", "13-digit local mobile"],
		["0812-345-678", "62812345678", "10-digit local mobile"],
		["+62 812 3456 7890", "6281234567890", "international form"],
		[
			"812 3456 7890",
			"6281234567890",
			"leading 0 dropped by a spreadsheet",
		],
		["0812-345-67", null, "9 digits: too short for Indonesia"],
		["0812-3456-7890-12", null, "14 digits: too long for Indonesia"],
		["021-555-1234", null, "Indonesian landline, not a mobile"],
		["+61 432 698 401", "61432698401", "Australian mobile"],
		["12ab", null, "letters"],
		["", null, "empty"],
	];
	for (const [typed, want, why] of cases)
		ok(
			normalizePhone(typed) === want,
			`${why}: "${typed}"`,
			String(normalizePhone(typed)),
		);
	ok(
		keepPhoneChars("0812-abc 3456/7890!") === "0812- 34567890",
		"typing keeps only digits, +, spaces, dashes and brackets",
		keepPhoneChars("0812-abc 3456/7890!"),
	);
	ok(
		keepPhoneChars("0".repeat(30)).length === 20,
		"typing stops at 20 characters",
	);
}

section("full names");
{
	for (const good of [
		"Budi Santoso",
		"Moh. Ma'ruf",
		"Siti Nur-Aini",
		"Rina",
		"Ni Luh Putu Ayu Wijaya, S.Kom",
		"Élodie Müller",
	])
		ok(personNameProblem(good) === null, `accepted: "${good}"`);
	ok(personNameProblem("   ") === "personNameEmpty", "blank is refused");
	ok(
		personNameProblem("Budi 007") === "personNameInvalid",
		"digits are refused",
	);
	ok(
		personNameProblem("Budi@home") === "personNameInvalid",
		"symbols are refused",
	);
	ok(
		personNameProblem("-Budi") === "personNameInvalid",
		"must start with a letter",
	);
	ok(personNameProblem("a".repeat(70)) === null, "70 characters is allowed");
	ok(
		personNameProblem("a".repeat(71)) === "personNameTooLong",
		"71 characters is too long",
	);
	ok(
		keepNameChars("Budi 007 Santoso!") === "Budi  Santoso",
		"typing drops digits and symbols",
		keepNameChars("Budi 007 Santoso!"),
	);
	ok(
		tidyPersonName("  Budi   Santoso ") === "Budi Santoso",
		"spaces are tidied",
	);
}

done();
