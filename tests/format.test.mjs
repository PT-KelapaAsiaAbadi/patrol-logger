// Time formatting. Run with --experimental-strip-types so the TypeScript module loads directly.
process.env.TZ = "Asia/Jakarta";
const { formatTime, formatDateTime } = await import("../src/lib/format.ts");
const { reporter } = await import("./local-supabase.mjs");
const { ok, section, done } = reporter();

section("times");
const at = "2026-09-25T10:40:00Z"; // 17:40 WIB
ok(
	formatTime(at, "id") === "17:40",
	"Indonesian time uses a colon",
	formatTime(at, "id"),
);
ok(
	formatDateTime(at, "id") === "25 Sep, 17:40",
	"Indonesian date and time",
	formatDateTime(at, "id"),
);
ok(
	/^05:40\s?pm$/i.test(formatTime(at, "en")),
	"English keeps 12-hour time",
	formatTime(at, "en"),
);
done();
