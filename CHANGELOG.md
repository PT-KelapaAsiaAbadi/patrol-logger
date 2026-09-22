# Changelog

This file only documents version changes (e.g. new/updated/removed features only, etc.), not small changes made on each git commit.

## Unreleased

- The repository now holds the modular prototype described in `CLAUDE.md` (`index.html`, `css/`, `js/`, `tests/`, `tools/`, `docs/`). The earlier Google Apps Script app was removed; it stays in git history.
- **Scan photos removed** (phase 1). A scan carries the code, position and time only. No image is captured, sent or stored for a scan.
- **The camera records on its own.** It reads codes continuously and records the scan as soon as the chosen checkpoint's code is in view. The Capture button and the two-step code-then-area capture are gone.
- **Flags follow `docs/spec.md`.** `REUSED_PHOTO`, `PHOTO_GAP`, `NO_AREA_PHOTO`, `NO_PHOTO`, `DARK_PHOTO` and `BLURRY_PHOTO` are gone, and the "require area photo" rule with them. `REUSED_REPORT_PHOTO` is new: a report photo that was already sent with an earlier report is flagged.
- The demo site shows the reuse pattern through report photos instead of scan photos, and now seeds three reports.
