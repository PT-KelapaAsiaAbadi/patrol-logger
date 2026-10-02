# Patroli (prototype)

[![CI](https://github.com/PT-KelapaAsiaAbadi/patrol-logger/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/PT-KelapaAsiaAbadi/patrol-logger/actions/workflows/ci.yml)
![Status: prototype](https://img.shields.io/badge/status-prototype-orange)

[![Preact](https://img.shields.io/github/package-json/dependency-version/PT-KelapaAsiaAbadi/patrol-logger/preact?logo=preact&logoColor=white&color=673AB8)](https://preactjs.com)
[![TypeScript](https://img.shields.io/github/package-json/dependency-version/PT-KelapaAsiaAbadi/patrol-logger/dev/typescript?logo=typescript&logoColor=white&color=3178C6)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/github/package-json/dependency-version/PT-KelapaAsiaAbadi/patrol-logger/dev/vite?logo=vite&logoColor=white&color=646CFF)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/github/package-json/dependency-version/PT-KelapaAsiaAbadi/patrol-logger/dev/tailwindcss?logo=tailwindcss&logoColor=white&color=06B6D4)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/github/package-json/dependency-version/PT-KelapaAsiaAbadi/patrol-logger/@supabase/supabase-js?label=supabase-js&logo=supabase&logoColor=white&color=3FCF8E)](https://supabase.com)
![PWA: installable, works offline](https://img.shields.io/badge/PWA-installable%20%C2%B7%20offline-5A0FC8?logo=pwa&logoColor=white)
![Languages: Bahasa Indonesia, English](https://img.shields.io/badge/languages-Bahasa%20Indonesia%20%C2%B7%20English-blue)

QR checkpoint patrol logger. Guards scan stickers on their round; supervisors see the log.

## Run locally

Needs Docker Desktop running (for the local Supabase stack).

```bash
npm install
npx supabase start       # local Postgres, Auth, Storage, Edge Functions; applies migrations + seed.sql
npx supabase status      # prints the local API URL and publishable (anon) key
npm run dev              # http://localhost:5173 (camera works on localhost)
```

Two env files point the app at a Supabase project; git ignores both. Vite picks one by itself:

| File | Used by | Points at |
| --- | --- | --- |
| `.env.development.local` | `npm run dev` | the local stack, so testing never touches live data |
| `.env.production.local` | `npm run build` | the hosted project (PatrolLogger) |

```ini
# .env.development.local (values from `npx supabase status`)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase status>
```

`.env.production.local` has the same two lines with the hosted project's URL and publishable key (Supabase dashboard > Project Settings > API). Don't create a plain `.env.local`: it's read in every mode, and its values would apply wherever the mode's own file doesn't set them.

Local accounts from `supabase/seed.sql` (password `patroli-local-1`): supervisor `0811-0000-0001`, guard `0811-0000-0002`. Everyone signs in with a phone number and password; nobody can sign up.

No text messages are sent, locally or hosted. The local config switches Twilio on with placeholder values only because Supabase won't allow phone sign-in without an SMS provider. One-time codes to confirm a number aren't built yet: the option and the "Confirm number" button are shown but disabled (see TODO).

Other commands:

```bash
npm run db:reset         # rebuild the local database from migrations + seed
npm run db:types         # regenerate database.types.ts from the local database
npm run build            # hosted build with service worker, installable as a PWA
npm run lint             # oxlint (typescript-eslint doesn't support TypeScript 7)
npm run format           # Prettier; format:check is what CI runs
npm test                 # backend + browser tests against the local stack (resets the local database)
```

`npm test` needs the local stack running. The browser test uses the installed Microsoft Edge on Windows; elsewhere run `npx playwright-core install chromium` once, or set `PW_CHANNEL`. CI (`.github/workflows/ci.yml`) runs lint, format check, type check and build on every push, then starts a local Supabase stack and runs `npm test`.

To test on a real phone, the page must be served over **https** (the camera is blocked on plain http).
Easiest: `npm run build`, then drag `dist/` into Netlify Drop or Cloudflare Pages.

## Hosted project (PatrolLogger)

```bash
npx supabase link --project-ref <your-project-ref>   # Dashboard > Project Settings > General > Project ID
npx supabase db push                          # applies new files in supabase/migrations (never seed.sql); rerun after each update
npx supabase functions deploy create-guards
npx supabase functions deploy reset-password
npx supabase functions deploy staff-phone
```

Then in the dashboard:

1. **Authentication > Sign In / Providers**: turn off "Allow new users to sign up". Accounts are only made by supervisors.
2. **Authentication > Sign In / Providers > Phone**: turn the Phone provider on and pick an SMS provider (Twilio, Twilio Verify, MessageBird, Vonage or Textlocal) with its credentials. Supabase refuses phone sign-in, even with a password, until one is set. "Enable phone confirmations" can stay off: supervisors create accounts already confirmed.

   **Current setup: placeholders.** PatrolLogger uses "Twilio" with placeholder values (Account SID `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, Auth Token `00000000000000000000000000000000`, Message Service SID `MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`). Phone + password sign-in never contacts the provider, so it works, and nothing is paid. One-time codes aren't built yet, so every number shows "Not confirmed". This relies on Supabase behaviour that isn't documented (tested on the local stack), so recheck sign-in after Supabase updates.
3. **Authentication > Rate Limits**: the default is 30 texts an hour for the whole project. Raise it if many staff are registered at once.
4. **The first supervisor.** Authentication > Users > Add user, with an email and password and "Auto Confirm User" ticked (the dashboard form asks for an email). Then in the **SQL Editor**, give it a phone number (digits, country code first, no "+" or leading 0) and a supervisor profile:

   ```sql
   update auth.users set phone = '6281234567890', phone_confirmed_at = now()
   where email = 'you@example.com';

   insert into public.profiles (id, name, phone, email, role)
   select id, 'Supervisor name', phone, email, 'supervisor' from auth.users where email = 'you@example.com';
   ```

From then on, supervisors add guards (and other supervisors) from the Accounts tab.

### Accounts made before phone sign-in

Accounts created with an email can't sign in to this version until they have a phone number. Do your own supervisor account in the **SQL Editor** before deploying the new app:

```sql
update auth.users set phone = '6281234567890', phone_confirmed_at = now() where email = 'you@example.com';
update public.profiles set phone = '6281234567890' where email = 'you@example.com';
```

Everyone else can then be given a number from the Accounts tab ("Add phone number" on their row). Check numbers in person for now.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| UI | Preact + TypeScript | React API you already know, about 4 KB |
| Routing | wouter-preact | about 2 KB, hash routing needs no server config |
| Styling | Tailwind v4 | tokens in `index.css`, no runtime cost |
| QR scanning | qr-scanner | native BarcodeDetector when available, worker fallback |
| QR generation | qrcode | supervisor label sheet |
| Offline / install | vite-plugin-pwa | caches the app shell, adds manifest |
| Backend | Supabase | Postgres + Row Level Security, Auth (phone number + password), Storage, three Edge Functions |
| Offline queue | idb-keyval | IndexedDB holds hundreds of MB, so queued report photos fit |
| Icons | Lucide (`lucide-preact`) | vector icons, each imported on its own; icon-only buttons have an aria-label and hover/focus help text (`src/lib/tooltip.ts`). No emoji anywhere |
| Checkpoint map | Leaflet + OpenStreetMap tiles | free, no API key; loaded only when a supervisor opens the map |
| Address search | Nominatim (OpenStreetMap) | free, no API key; searches only on "Search", as its usage policy asks |

Whole app: about 100 KB gzipped, most of it supabase-js. The service worker caches it after the first visit.

## Layout

```
src/
  types.ts              shapes shared by everything (camelCase mirror of the tables)
  i18n.ts               Bahasa Indonesia + English strings
  data/
    backend.ts          Supabase calls. Nothing else imports it except api.ts
    api.ts              what pages call. Decides: send now, or park in the outbox
    queue.ts            offline outbox in IndexedDB (runs on the phone)
    network.ts          online/offline state
  lib/
    scanner.ts          camera + QR decode, isolated so you can rebuild it by hand
    image.ts            shrinks photos before upload
    labels.ts           printable QR sticker sheet
    csv.ts              scan export, guard CSV import
    print.ts            prints a label sheet through a hidden iframe
    updates.ts          switches in a new app version only on a screen where a reload loses nothing
    geo.ts              the phone's GPS position while the scan screen is open
    map.ts, geocode.ts  checkpoint map (Leaflet) and address search (Nominatim), supervisor only
    download.ts, format.ts, id.ts
  pages/guard/          Home (round), Scan, Report
  pages/supervisor/     Today (start page: completed / not yet visited checkpoints, guards on duty,
                        needs review), Log = the Log Database tab (paginated scan log, CSV),
                        Schedule (manual scheduling: who works each shift; rules in lib/schedule.ts),
                        ScanDetail, Map (one day: checkpoints, scans, a guard's route),
                        Guards = the Accounts tab (add one, import CSV, new password, deactivate),
                        AccountsTable (change a number; "Confirm number" shown disabled for now),
                        Checkpoints (round order, rename, replace sticker, add, select, print QR)
supabase/
  migrations/           tables, Row Level Security, server functions, QR signing key, photo bucket
  functions/            create-guards, reset-password, staff-phone (service-role key), _shared/
  seed.sql              local test accounts and checkpoints
tests/                  backend.test.mjs (each role against the API), e2e.test.mjs (the app in a browser),
                        camera.test.mjs (a real camera scan, using the browser's fake camera showing a QR sticker),
                        location.test.mjs (location messages with scripted GPS; a refused scan isn't "no signal")
```

## How the backend works

| backend.ts | Supabase |
| --- | --- |
| `signIn` | `supabase.auth.signInWithPassword` with the phone number, then the caller's row in `profiles` (role, active) |
| `createGuards` | `create-guards` Edge Function: `auth.admin.createUser` with the phone number and a generated password, then a `profiles` row (guard or supervisor) |
| `changePhone` | `staff-phone` Edge Function: change someone's number (Auth and `profiles` together); the new number starts unconfirmed |
| `resetPassword` | `reset-password` Edge Function: a new generated password, shown once |
| `setAccountActive` | `set_account_active()`: a deactivated account can't sign in and its open sessions get nothing |
| `submitScan` | `submit_scan()`: verifies the QR's HMAC with a key kept in Vault, or matches the manual code, then inserts. The guard is always the caller |
| `submitReport` | photos uploaded to the private `report-photos` bucket, then `submit_report()` stores their paths |
| `qrPayloadFor` | `qr_payload()`, supervisors only |
| `createCheckpoint` | `create_checkpoint()`: next route position and a unique manual code |
| `updateCheckpoint`, `moveCheckpoint` | `update_checkpoint()`, `move_checkpoint()` |
| `reissueCheckpoint` | `reissue_checkpoint()`: bumps `qr_version` (part of the QR signature) and issues a new manual code, so every copy of the old sticker stops working |
| `listScans`, `exportScans`, `getScan` | the `scan_rows` view, paged with `.range()`; photos shown via signed URLs |
| `guardSummaries`, `missedCheckpoints` | `guard_summaries()`, `missed_checkpoints()` |

| `setCheckpointLocation` | `set_checkpoint_location()`: moves a checkpoint's pin and radius (a location can't be cleared: remove the checkpoint instead) |

## Location checks

Supervisors pin each checkpoint on a map (Checkpoints tab: tap the map, search an address, use their own position, or paste coordinates) and set a radius, 50 m by default. The guard's phone reads GPS while the scan screen is open and sends its position with each scan, including scans made offline. The server records how far that was from the checkpoint:

| Status | Meaning |
| --- | --- |
| At checkpoint | within the radius, allowing for the phone's stated accuracy (up to 100 m extra) |
| far | further than that; the guard sees a warning, the supervisor sees the distance |
| No GPS | the phone had no position less than a minute old (permission off, indoors, older app) |
| Checkpoint not pinned | only on scans from before every checkpoint needed a location |

The **Map** tab shows one day at a time: checkpoints (green once visited that day), each scan at the position the phone reported (orange, with a dashed line to its checkpoint, when far), and, when one guard is chosen, that guard's route in time order. Scans without GPS are counted under the map rather than drawn.

Scans that are far away are **flagged, not rejected**: GPS is often weak or missing in basements and stairwells, and blocking those scans would stop honest guards. The distance is stored with the scan, so moving a checkpoint later doesn't rewrite history. Limits: a phone with a GPS-spoofing app can fake its position, and indoor readings can be off by tens of metres, so treat a single "far" as a question, not proof.

Row Level Security: guards read only their own profile, scans and reports; supervisors read everything. Guards never see manual codes. No table accepts writes from the app directly: every write goes through a function that checks the caller.

## Status and TODO

What the prototype does today, what's still to build, and what's waiting on a decision. `TODO:` comments in the code are highlighted by the TODO Highlight extension (`.vscode/settings.json`).

### Built

**Guard app** (phone only)

- [x] Sign in with phone number and password (show/hide password).
- [x] Today's round: a greeting, a progress bar, the next checkpoint, and every checkpoint in round order, ticked once scanned.
- [x] Scan a QR sticker with the camera, or type the code printed under it. The scanner opens the back camera that has the flash; a flashlight button where the browser can switch the torch (Chromium browsers on Android). After a scan: the result, the location check and the next checkpoint.
- [x] GPS position sent with each scan; a scan far from its checkpoint is logged but flagged, and the guard is told.
- [x] Report on a scan: a note (up to 1,500 characters, about 200 words) and up to 5 photos, taken with the camera or picked from the gallery, shrunk before upload.
- [x] Works offline: scans and reports wait on the phone (IndexedDB) and send when there's signal; Try again and Discard for ones the server refused; signing out warns about anything unsent.
- [x] Installable app (PWA); a new version switches in only on a screen where a reload loses nothing.

**Supervisor screens** (phone, tablet and desktop layouts)

- [x] Today: Needs review (far, no GPS, has a report, sent late, too fast), Not yet visited (each with a link that opens the Map on it), Completed checkpoints, Guards on duty (Patrolling, Quiet, Not started). Refreshes every minute and when the tab comes back.
- [x] Log Database: every scan, filtered by guard, checkpoint and date (the date chip shows "dd/mm/yyyy" on phones, which leave an empty date field blank), with the same flags as Needs review, paged, with CSV export. Each row opens the scan; one line per scan on phones.
- [x] View report (scan detail): the location check, the scan's times and map links, the report note and photos (full size on a tap). Back returns to where it was opened from.
- [x] Map: one day's checkpoints and scans; one guard's route in time order; can open zoomed in on one checkpoint.
- [x] Schedule: manual scheduling. Assign guards to Morning, Afternoon and Night shifts (07-15, 15-23, 23-07) day by day, move between weeks, copy last week. Warnings for shifts nobody works (from today on), more than 40 hours a week and less than 8 hours' rest. A guard can't be on two shifts at once. Days that have passed are read-only (shown, but no assigning or removing; Copy last week skips them). Desktop grid; on phones a day strip and a card per shift.
- [x] Accounts: add one or import a CSV, a new password, change a number, deactivate.
- [x] Checkpoints and QR: add (a location is required: map, address search, own position or coordinates), rename, reorder, take out of use, move a pin, replace a sticker, remove; select some to print a QR sheet or download it as a PDF; a QR panel beside the table on desktop.

**Both**

- [x] Bahasa Indonesia and English; system, light and dark themes; 44 px tap targets on touch screens.
- [x] The new design (blue for actions, amber only for warnings) on Sign in, every guard screen, Today, Log Database, View report, Schedule, Checkpoints and QR, and More. Still on the old design: see "Screens" below.

**Backend and checks**

- [x] Row Level Security on every table; every write goes through a server function that checks the caller.
- [x] Signed QR codes (HMAC, key in Vault); "Replace sticker" invalidates every copy of the old one.
- [x] Report photos in a private bucket, shown through short-lived signed URLs.
- [x] Accounts managed through Edge Functions (`create-guards`, `reset-password`, `staff-phone`).
- [x] CI: lint, formatting, type check, build, then unit, backend, browser, camera and location tests against a local Supabase.

### Not built yet

**Launch**

- [ ] Implement one-time codes to confirm a staff member's number. Removed for now because PatrolLogger's phone provider has placeholder Twilio values (sign-in only, see "Hosted project"). Needs a real provider's details, or a Send SMS hook that delivers codes another way. The UI is in place but disabled: the "Send a one-time code" option ([src/pages/supervisor/Guards.tsx](src/pages/supervisor/Guards.tsx)) and the "Confirm number" button ([src/pages/supervisor/AccountsTable.tsx](src/pages/supervisor/AccountsTable.tsx)). `profiles.phone_verified_at` is ready and always null for now. A working version, with tests, is in commit `947b3c6`: `staff-phone` `send_code` / `verify_code`, `sendCode` in `create-guards`, `PhoneCode.tsx`, and fixed local test codes in `config.toml`. Until then, check numbers in person.
- [ ] Deploy the backend to PatrolLogger (commands above), then in the dashboard: turn off sign-up, turn on the Phone provider with an SMS provider, set the minimum password length to 10 and the site URL to the app's address, give existing accounts a phone number or create the first supervisor.
- [ ] **Run the three newest migrations on PatrolLogger.** [20260930120000_checkpoint_location_required.sql](supabase/migrations/20260930120000_checkpoint_location_required.sql) deletes checkpoints without a location that were never scanned, removes those that were (their scans keep them), then refuses a checkpoint in use without a location and makes `p_lat` / `p_lng` required in `create_checkpoint`. Before running it: deploy the app version that always sends a location (older ones add checkpoints by name alone), and pin any unpinned checkpoint you want to keep. [20260930130000_contiguous_stop_numbers.sql](supabase/migrations/20260930130000_contiguous_stop_numbers.sql) keeps stop numbers 1, 2, 3… with no gaps after a removal. [20261002120000_shifts.sql](supabase/migrations/20261002120000_shifts.sql) adds the `shifts` table (and the `btree_gist` extension for its no-overlap rule) with `assign_shift`, `remove_shift` and `copy_shifts`, which refuse changes to days that have passed; deploy it with, or before, the app version that has the Schedule page.
- [ ] Host the app over https (Netlify, Cloudflare Pages or Vercel) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in the host's build settings.
- [ ] Test on real phones at the site: a cheap Android and an iPhone, installed from the browser, scanning printed stickers, offline in basements and stairwells.
- [ ] Run Supabase's Security and Performance Advisors on the hosted project.

**Screens**

- [ ] **Use shifts elsewhere.** The Schedule page saves who works when, but nothing reads it yet: Today's Guards on duty should show who is on shift now (and a "Late start" for a shift that began with no scans), the guard's home screen should show their shift (the design's "Morning shift" under the date), and missed checkpoints should be counted per shift instead of per calendar day. The guard app would also cache the guard's shifts for offline use ([src/lib/schedule.ts](src/lib/schedule.ts)).
- [ ] **Today: Needs review** lists every flagged scan until the day ends. Add a "Mark as reviewed" action (`reviewed_at` / `reviewed_by` on scans) so handled ones drop off. Rules and thresholds: [src/lib/today.ts](src/lib/today.ts).
- [ ] **Log Database: search and flag filter.** The page has the new design (pill filters, flags, one line per scan on phones). Still to build, as in the design: a search box (guard or checkpoint name, report text) and an "Any flag" filter, and one filter bar shared with the Map tab (guard, checkpoint, date or date range, location status). Search and the flag filter must run on the server so they work with paging and the CSV export ([src/pages/supervisor/Log.tsx](src/pages/supervisor/Log.tsx)).
- [ ] **Still on the old design:** Accounts (form cards and table; the table scrolls sideways on a phone), Map (filters and legend; as pills, its date filter should reuse the Log's `.date-chip`, which shows "dd/mm/yyyy" on phones), and the "Page not found" screen. Per screen, with the next step: [ARCHITECTURE.md](ARCHITECTURE.md) section 7.2.
- [ ] **Report photos that can't be read** are skipped without a word ([src/pages/guard/Report.tsx](src/pages/guard/Report.tsx)). Tell the guard, e.g. a short notice under the photos.

**Database tidy-ups**

- [ ] **Checkpoint names:** the app allows 3 to 50 characters, no repeats (ignoring case), and at least one letter or digit ([src/lib/checkpointName.ts](src/lib/checkpointName.ts)). The database still allows up to 80. Tighten it once hosted names have been checked against the new rule.
- [ ] **Account names and phones:** full names are 1 to 70 characters of letters, spaces and `. , ' -` ([src/lib/personName.ts](src/lib/personName.ts)); phones are stored as text in E.164 digits (no `+`), Indonesian mobiles only 10 to 13 digits as typed ([src/lib/phone.ts](src/lib/phone.ts)). Both are checked again on the server (`_shared/names.ts`, `_shared/phone.ts`). The database's `profiles` checks are looser (names up to 120; any 8 to 15 digits): tighten them once hosted accounts have been checked. If many numbers from other countries get registered, validate with `libphonenumber-js` instead of the 8 to 15 digit rule (roughly 80 KB or more on guards' prepaid data).

**Operations**

- [ ] Error reporting (for example Sentry), so failures on guards' phones are visible.
- [ ] Supabase plan with restorable backups.
- [ ] Photo retention: decide how long to keep report photos, then add a scheduled cleanup.
- [ ] Privacy under UU PDP (27/2022): privacy notice for guards, retention period, who can see what.
- [ ] How one-time passwords reach guards, and when the password CSV is deleted.
- [ ] One-page guard guide (Indonesian) and a supervisor guide.

### Not decided yet

**Per-guard checkpoints and shifts** (the owner's new requirement: each guard has a schedule, and may cover a different set of checkpoints). Questions for the owner before building:

- [ ] Is a guard's checkpoint list fixed, or chosen per shift (for example 1-3 on mornings, 6-8 on nights)? Proposed: named routes, assigned per shift, defaulting to the guard's usual one.
- [ ] Does each guard walk the checkpoints in their own order?
- [ ] When two guards share a checkpoint, does one scan count for both, or must each scan it?
- [ ] A scan of a checkpoint not on the guard's list, or outside their shift: proposed to accept and flag it (rejecting would break scans sent later from offline).
- [ ] Rounds per shift: once, or every few hours?
- [ ] What a guard with no shift right now sees.
- [ ] Shift names and times. The Schedule page offers 07-15, 15-23 and 23-07 (`SHIFT_KINDS` in [src/lib/schedule.ts](src/lib/schedule.ts)); changing them needs no migration. Until Today uses shifts, "missed checkpoints" is per calendar day, so a night shift over midnight is split.
- [ ] The Schedule page's warning limits: 40 hours a week (PP 35/2021's normal week) and 8 hours' rest between shifts (`SCHEDULE_RULES`). Confirm both with the owner or HR.

**Several sites** (each with its own guards, supervisors, checkpoints and logs). Proposed: one Supabase project per client company, several sites inside each, and an admin role across sites. Open: whether a supervisor covers several sites, whether guards move between sites, hosting region.

**Other**

- [ ] Alerts to supervisors for incident reports or missed checkpoints.
- [ ] Time zones: "today" is the supervisor's device's day; wrong if sites span WIB, WITA and WIT.
- [ ] One-time codes by WhatsApp instead of SMS (Supabase supports it only through Twilio or Twilio Verify, with a WhatsApp sender approved by Meta).
- [ ] Self-service password reset with a texted code (the SMS provider is in place; needs a screen and a rule for who may use it).
- [ ] Live updates on Today (Supabase Realtime) instead of a refresh every minute.

### Portability: phone sign-in without Supabase

Phone sign-in currently leans on Supabase Auth features that other backends don't have in the same form. If the project ever moves off Supabase (or wants to drop the paid SMS provider), refactor these first:

- [ ] The phone number lives twice: `auth.users.phone` (what Supabase signs in with) and `profiles.phone` (what the app shows). The Edge Functions keep them in step. Make `profiles.phone` the only source of truth and treat the auth identity as a detail of `backend.ts`.
- [ ] Sign-in calls `signInWithPassword({ phone })` ([src/data/backend.ts](src/data/backend.ts)), which Supabase only allows once an SMS provider is configured, even though no text is sent. Option: sign in with an internal identity derived from the number (e.g. `6281234567890@phone.patroli.invalid`) plus the password. Plain email + password works on any auth system and needs no SMS provider.
- [ ] When one-time codes are built: the earlier version used Supabase's `signInWithOtp` / `verifyOtp`, with the SMS provider set in the Supabase dashboard. Option: own codes (a table of hashed codes with an expiry and attempt count) sent through any SMS gateway, so the provider can change without touching sign-in.
- [ ] `normalizePhone` exists twice ([src/lib/phone.ts](src/lib/phone.ts) and `supabase/functions/_shared/phone.ts`) because Edge Functions can't import from `src/`. A new backend should keep one copy.
- [ ] Account management (`create-guards`, `reset-password`, `staff-phone`) uses the Supabase Auth admin API with the service-role key. Keep their request and response shapes, so only the server side changes and `backend.ts` stays the one file the app talks through.

## Known limits (by design, to discuss)

- A signed QR stops typed or guessed codes, but not a photo of the sticker. "Replace sticker" invalidates a copied one once you know; next layers would be a GPS check or a minimum time between checkpoints.
- `scannedAt` uses the phone clock. `receivedAt` is the server's; a big gap flags offline scans or a changed clock.
