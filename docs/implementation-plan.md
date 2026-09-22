# Implementation plan

Work one phase at a time. At the start of a phase, restate its acceptance criteria and make a short plan. A phase is done when every criterion is met and lint, typecheck and tests pass.

## Phase 1: Apply the new decisions to the prototype

Tasks:
- Remove scan photos: no code photo, no area photo, no photo hashes in scan requests, no photo checks for scans.
- Scanner reads codes automatically; remove the Capture button and the two-step capture. Keep the "only the chosen checkpoint's code" rule and the location wait.
- Update flags to match `docs/spec.md` (remove photo flags; add `REUSED_REPORT_PHOTO` for reports).
- Remove the "require area photo" rule from Setup and config.
- Update the dashboard review list (no scan photos) and the demo site (no scan photos; keep its reports).
- Update `tests/e2e.py`: no capture clicks, no photo assertions for scans; add a check that a reused report photo is flagged.

Acceptance:
- A scan request contains no image data. Local storage holds no scan photos.
- The camera path records a scan without any button press once the right code is in view.
- All e2e checks pass (updated), plus the new reused-report-photo check.
- `npm run build` still produces a working single file.

## Phase 2: Repository and tooling

Tasks:
- Move the app into `web/`; update paths, build script, tests and README.
- Initialise Supabase (`supabase init`). Note: running Supabase locally needs Docker. If Docker is not available, use a second free cloud project called `patrol-dev` and never test against the production project.
- Add unit tests for the pure checks (`js/server/checks.js`, `js/domain/rounds.js`) that run without a browser.

Acceptance: `npm test` runs unit and e2e tests; README explains local and dev-project setup.

## Phase 3: Database

Tasks:
- Migrations for every table in `docs/spec.md`, with RLS enabled and deny-by-default policies.
- Insert-only `scans` with the hash-chain trigger; `verify_log(from, to)` SQL function.
- Seed script that recreates the demo site (fixed checkpoint tokens) for the dev project.

Acceptance: migrations apply cleanly to an empty project; updating or deleting a scan fails for application roles; `verify_log` detects a manually edited row.

## Phase 4: Edge Functions

Tasks:
- `_shared/` module holding the checks, ported from `js/server/checks.js` without behaviour changes; the prototype and the functions should share one source if practical.
- Functions: `enroll`, `start-shift`, `guard-home`, `submit-scan`, `submit-report`.
- Rate limits: wrong enrollment codes and PINs as in the spec; reject bodies over a size limit.

Acceptance: Deno tests cover each function's success and failure paths; the same scan inputs produce the same flags as the prototype.

## Phase 5: Guard web app on the real API

Tasks:
- Replace the simulated server with an API client for the Edge Functions; keep the simulator only behind a development flag that the production build excludes.
- Offline queue unchanged in behaviour; uploads in order; retries are safe (same scanId or reportId returns the same answer).

Acceptance: e2e tests run against the dev project; a phone on real mobile data completes enroll, shift, scan and report.

## Phase 6: Supervisor dashboard

Tasks:
- Supabase Auth email login for staff; roles from the `staff` table.
- Dashboard reads through RLS; admin actions (enrollment codes, replace code, assignments, rounds, rules) through security-definer RPCs that check the role and write `admin_audit`.

Acceptance: a supervisor cannot change configuration; an owner can; every admin action appears in `admin_audit`.

## Phase 7: Weekly export and backup

Tasks:
- `export-week` Edge Function producing the week's data and an .xlsx (SheetJS), saved to the `exports` bucket and recorded in `exports`.
- Weekly schedule (Supabase scheduled job) that calls `export-week`.
- `apps-script/Code.gs`: weekly trigger, calls `export-week` with a secret, writes `Patrol YYYY-Www`, copies report photos to Drive.
- Dashboard section listing the last 12 exports with download links.

Acceptance: running the export for a seeded week produces matching counts in the .xlsx and the Google Sheet; report photos appear in Drive; the log fingerprint is recorded.

## Phase 8: Rounds, alerts, and replacing the lost photo evidence

Tasks:
- Missed-round detection every 15 minutes during patrol hours; optional Telegram alert to a supervisor group (free bot).
- **Site Wi-Fi check** (higher priority now that scan photos are gone): a small always-on page at the guard post reports the site's public IP every few minutes; `submit-scan` flags scans that did not come from it (`OFF_SITE_NETWORK`), only for checkpoints marked as covered by site Wi-Fi.

Acceptance: a skipped checkpoint raises an alert within 15 minutes of its round ending; a scan sent over mobile data from outside the site is flagged.

## Phase 9: Hardening and pilot

Tasks:
- Self-host jsQR and qrcode-generator instead of CDNs.
- Security review: signature checks, RLS policies, secrets, input limits, stored text escaping.
- Bahasa Indonesia interface strings.
- Test on the oldest real phone the guards use; measure load time and data use per scan.
- One-week pilot with 2 guards; review flags with the supervisor daily.

Acceptance: no high-severity findings open; pilot completed with the supervisor able to explain every flag.
