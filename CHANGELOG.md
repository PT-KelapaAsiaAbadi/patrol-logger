# Changelog

This file only documents version changes (e.g. new/updated/removed features only, etc.), not small changes made on each git commit.

## Unreleased

- The repository now holds the modular prototype described in `CLAUDE.md` (`index.html`, `css/`, `js/`, `tests/`, `tools/`, `docs/`). The earlier Google Apps Script app was removed; it stays in git history.
- **Scan photos removed** (phase 1). A scan carries the code, position and time only. No image is captured, sent or stored for a scan.
- **The camera records on its own.** It reads codes continuously and records the scan as soon as the chosen checkpoint's code is in view. The Capture button and the two-step code-then-area capture are gone.
- **Flags follow `docs/spec.md`.** `REUSED_PHOTO`, `PHOTO_GAP`, `NO_AREA_PHOTO`, `NO_PHOTO`, `DARK_PHOTO` and `BLURRY_PHOTO` are gone, and the "require area photo" rule with them. `REUSED_REPORT_PHOTO` is new: a report photo that was already sent with an earlier report is flagged.
- The demo site shows the reuse pattern through report photos instead of scan photos, and now seeds three reports.

## Phase 2 step a

- **Split into two apps.** `apps/guard/` (phones) and `apps/staff/` (dashboard and setup) are separate pages with their own entry points. They share code only through `shared/`, and each reaches the backend through its own `src/api.js`, which is the single place Phase 5 and Phase 6 swap for the real backend.
- The in-browser backend, the demo site and the demo shell moved to `dev/`, which production builds exclude. `dev/demo-site.js` no longer imports either app.
- ESLint enforces the import rules: neither app may import the other, neither may reach into `dev/` except through its `api.js`, and `shared/` may import neither.
- `npm run build` writes `dist/guard/` and `dist/staff/`, and fails if one app's code reaches the other. `npm run build:demo` writes `dist/patrol-demo.html` with both apps in one file.
- Behaviour is unchanged: the same 46 end-to-end checks pass, now driving two pages.
