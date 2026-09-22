# Guard Patrol: project context for Claude Code

Read this file first, then `docs/spec.md` and `docs/implementation-plan.md` before starting any task.
`docs/decisions.md` explains why each decision below was made.

## What this is

A QR-code patrol logging system for a small security business in Indonesia.
Guards scan a printed QR code at each checkpoint on their round; supervisors see who patrolled what and when.

- Users: 3 to 10 guards at first, possibly more later; 1 to 3 supervisors; 1 owner with no technical background.
- Budget: close to zero running cost. No paid services without asking M first.
- Guards use their own phones, often old, cheap Android phones on prepaid mobile data.
- M (the developer) is a CS graduate. Prefer honest, direct explanations and push back when something is a bad idea.

## Current state

- `index.html`, `css/`, `js/`: a working prototype. The backend is simulated inside the browser (`js/server/`), and all data stays in that browser.
- `tests/e2e.py`: Playwright end-to-end tests (41 checks). They must keep passing, updated as the flow changes.
- The next job is Phase 1 of `docs/implementation-plan.md`.

## Decisions that are fixed unless M changes them

1. **Guard side is a web app.** No native Android app, no NFC for now. Must run on old phones (Android 7+ with whatever Chrome they are stuck on).
2. **No framework.** Plain JavaScript ES modules, JSDoc types checked by `tsc` in strict mode. No build step for development; `npm run build` makes a single-file version only when needed.
3. **Backend: Supabase free tier, Singapore region.** PostgreSQL, Storage, Edge Functions (Deno), Auth for supervisors, scheduled jobs. No credit card.
4. **Guards never talk to the database directly.** All guard traffic goes through Edge Functions that verify the phone's signature and run the checks. Row-level security denies everything by default.
5. **No scan photos.** The camera only reads the QR code; no image of the scan is stored or uploaded.
6. **Report photos only.** After a scan the guard may send a report: optional note, 0 to 5 photos, at least one of the two.
7. **Weekly backup.** Every week the data is exported to a Google Sheet and to an Excel (.xlsx) file, and report photos are copied to Google Drive. There is no other backup on the free plan.
8. **Supervisors** use the web dashboard for live information; the weekly export is the report and backup.

## Architecture

```
Guard phone (web app) --signed requests--> Supabase Edge Functions --> Postgres (append-only scan log)
                                                                   --> Storage (report photos, private)
Supervisor dashboard (web) --Supabase Auth + RLS--> Postgres (read, review, admin actions via RPC)
Scheduled job (weekly) --> export-week Edge Function --> .xlsx in Storage
Google Apps Script (weekly trigger) --> export-week --> Google Sheet + report photos to Drive
```

## Repository layout (target)

```
web/                 Guard app and dashboard (moved here from the prototype root in Phase 2)
  index.html, css/, js/
supabase/
  migrations/        SQL: schema, RLS policies, triggers, RPCs
  functions/         Edge Functions; _shared/ holds the scan checks shared by functions
apps-script/         Code.gs for the weekly Google Sheets export
tests/               e2e (Playwright), plus unit tests for the checks
docs/                spec, plan, decisions
tools/               build-single-file.mjs
```

## Commands

```bash
npm start              # serve the prototype at http://localhost:8000
npm run lint           # ESLint
npm run typecheck      # tsc strict over JSDoc
npm run format         # Prettier
npm run build          # single-file version in dist/
npm test               # fake camera video + Playwright e2e
```

Before calling any task done: `npm run lint`, `npm run typecheck`, and `npm test` must pass.

## Code conventions

- Modules depend in one direction: `lib` (no app knowledge) <- `domain` (patrol rules) <- `server` / functions <- UI (`guard`, `dashboard`, `setup`).
- Every threshold, limit and storage key lives in `js/config.js` (and a matching config in the backend). No magic numbers.
- Scan checks are small functions that only read their inputs and return flags (`js/server/checks.js`). Keep them pure so they can be unit tested and shared with the Edge Functions.
- Names are spelled out: `checkpoint`, not `cp`; `#enroll-guard-id`, not `#g-id`.
- Build DOM with the `el()` helper and `textContent`. Never put user or server text into `innerHTML`.
- Functions stay short (ESLint warns above 60 lines or complexity 12). Split rather than disable the rule.
- Keep `docs/spec.md` in sync with behaviour changes, and add an entry to `docs/decisions.md` for any decision change.

## Security rules

- Never trust the phone: GPS, time, and anything in the request are claims. The server checks and flags; it decides.
- The Supabase service role key only ever lives in Edge Function secrets. Never in `web/`, never committed.
- The scans table is insert-only for application roles; the hash chain is computed in the database.
- Store PINs only as salted hashes; limit wrong PINs and wrong enrollment codes.
- Validate sizes and counts server-side (note length, photo count 0 to 5, photo size).
- Keep the device signing key non-extractable (WebCrypto). Every guard request is signed.

## UI rules

- Guard app: dark, high-contrast night palette, large tap targets, one clear action per screen, works one-handed.
- Lightweight: no frameworks, lazy-load the QR library only if the browser has no built-in reader, report photos shrunk to at most 800 px JPEG.
- Avoid the look of generic AI-built apps. Specifically do not add: SVG-drawn icon sets, chips/pills, glowing green "live" dots, glow effects, em dashes in interface text, rule-of-three filler copy, or vague "AI-powered" claims.
- Interface text is English for now; Bahasa Indonesia is planned, so keep strings easy to extract.

## How to work in this repo

- Work one phase of `docs/implementation-plan.md` at a time. Start by restating the phase's acceptance criteria, then plan, then implement.
- If a task seems to require changing a fixed decision above, stop and ask M instead of changing it.
- Look up current Supabase and browser documentation rather than relying on memory; APIs and free-tier limits change.
- Never run commands that delete data or reset a remote Supabase project without M confirming.
