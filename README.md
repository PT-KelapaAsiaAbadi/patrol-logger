# Patroli (prototype)

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

```
# .env.development.local (values from `npx supabase status`)
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase status>
```

`.env.production.local` has the same two lines with the hosted project's URL and publishable key (Supabase dashboard > Project Settings > API). Don't create a plain `.env.local`: it's read in every mode, and its values would apply wherever the mode's own file doesn't set them.

Local accounts from `supabase/seed.sql` (password `patroli-local-1`): supervisor `0811-0000-0001`, guard `0811-0000-0002`. Everyone signs in with a phone number and password; nobody can sign up.

Locally no text messages are sent. The numbers `0811-0000-0901` and `0811-0000-0902` always get the one-time code `123456` (`[auth.sms.test_otp]` in `supabase/config.toml`), so use them to try "Send a one-time code". The local config switches Twilio on with placeholder values only because Supabase won't allow phone sign-in without an SMS provider.

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
npx supabase link --project-ref cfiayahvwjjqhmayakmy
npx supabase db push                          # applies new files in supabase/migrations (never seed.sql); rerun after each update
npx supabase functions deploy create-guards
npx supabase functions deploy reset-password
npx supabase functions deploy staff-phone
```

Then in the dashboard:

1. **Authentication > Sign In / Providers**: turn off "Allow new users to sign up". Accounts are only made by supervisors.
2. **Authentication > Sign In / Providers > Phone**: turn the Phone provider on and pick an SMS provider (Twilio, Twilio Verify, MessageBird, Vonage or Textlocal) with its credentials. Supabase refuses phone sign-in, even with a password, until one is set. "Enable phone confirmations" can stay off: supervisors create accounts already confirmed.

   **Current setup: placeholders.** PatrolLogger uses "Twilio" with placeholder values (Account SID `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`, Auth Token `00000000000000000000000000000000`, Message Service SID `MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`). Phone + password sign-in never contacts the provider, so it works, and nothing is paid. One-time codes can't be sent: "Send a one-time code" ends with "The code couldn't be sent", and numbers stay "Not confirmed". This relies on Supabase behaviour that isn't documented (tested on the local stack), so recheck sign-in after Supabase updates.
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

Everyone else can then be given a number from the Accounts tab ("Add phone number" on their row), and confirmed with a one-time code.

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
  pages/supervisor/     Log (paginated), ScanDetail, Map (one day: checkpoints, scans, a guard's route),
                        Guards = the Accounts tab (add one, import CSV, new password, deactivate),
                        AccountsTable (change a number, confirm it), PhoneCode (the one-time code step),
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
| `createGuards` | `create-guards` Edge Function: `auth.admin.createUser` with the phone number and a generated password, then a `profiles` row (guard or supervisor). Optionally texts a one-time code |
| `changePhone`, `sendPhoneCode`, `verifyPhoneCode` | `staff-phone` Edge Function: change someone's number; text a code (`signInWithOtp`, never creating an account); check the code the person read out and set `profiles.phone_verified_at` |
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

| `setCheckpointLocation` | `set_checkpoint_location()`: a checkpoint's position and radius, or none |

## Location checks

Supervisors pin each checkpoint on a map (Checkpoints tab: tap the map, search an address, use their own position, or paste coordinates) and set a radius, 50 m by default. The guard's phone reads GPS while the scan screen is open and sends its position with each scan, including scans made offline. The server records how far that was from the checkpoint:

| Status | Meaning |
| --- | --- |
| At checkpoint | within the radius, allowing for the phone's stated accuracy (up to 100 m extra) |
| far | further than that; the guard sees a warning, the supervisor sees the distance |
| No GPS | the phone had no position less than a minute old (permission off, indoors, older app) |
| Checkpoint not pinned | the checkpoint has no location yet |

The **Map** tab shows one day at a time: checkpoints (green once visited that day), each scan at the position the phone reported (orange, with a dashed line to its checkpoint, when far), and, when one guard is chosen, that guard's route in time order. Scans without GPS and checkpoints without a location are counted under the map rather than drawn.

Scans that are far away are **flagged, not rejected**: GPS is often weak or missing in basements and stairwells, and blocking those scans would stop honest guards. The distance is stored with the scan, so moving a checkpoint later doesn't rewrite history. Limits: a phone with a GPS-spoofing app can fake its position, and indoor readings can be off by tens of metres, so treat a single "far" as a question, not proof.

Row Level Security: guards read only their own profile, scans and reports; supervisors read everything. Guards never see manual codes. No table accepts writes from the app directly: every write goes through a function that checks the caller.

## TODO

Open work before real use. `TODO:` comments in the code are highlighted by the TODO Highlight extension (`.vscode/settings.json`).

### Launch

- [ ] One-time codes: PatrolLogger's phone provider has placeholder Twilio values (sign-in only, see "Hosted project"). To send codes, enter a real provider's details, or add a Send SMS hook that delivers them some other way. Until then, don't tick "Send a one-time code" and confirm numbers in person.

- [ ] Deploy the backend to PatrolLogger (commands above), then in the dashboard: turn off sign-up, turn on the Phone provider with an SMS provider, set the minimum password length to 10 and the site URL to the app's address, give existing accounts a phone number or create the first supervisor.
- [ ] Host the app over https (Netlify, Cloudflare Pages or Vercel) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set in the host's build settings.
- [ ] Test on real phones at the site: a cheap Android and an iPhone, installed from the browser, scanning printed stickers, offline in basements and stairwells.
- [ ] Run Supabase's Security and Performance Advisors on the hosted project.

### Operations

- [ ] Error reporting (for example Sentry), so failures on guards' phones are visible.
- [ ] Supabase plan with restorable backups.
- [ ] Photo retention: decide how long to keep report photos, then add a scheduled cleanup.
- [ ] Privacy under UU PDP (27/2022): privacy notice for guards, retention period, who can see what.
- [ ] How one-time passwords reach guards, and when the password CSV is deleted.
- [ ] One-page guard guide (Indonesian) and a supervisor guide.

### Supervisor screens

- [ ] Refactor the log filters into one filter bar shared with the Map tab (guard, checkpoint, date or date range, location status), and add a search box (guard or checkpoint name, report text). Search must run on the server so it works with paging and the CSV export ([src/pages/supervisor/Log.tsx](src/pages/supervisor/Log.tsx)).

### Decisions (not built)

- [ ] Shifts: "missed checkpoints" is per calendar day, so a night shift over midnight is split and rounds within a shift aren't tracked.
- [ ] Several sites or routes (there's one route for everyone).
- [ ] Alerts to supervisors for incident reports or missed checkpoints.
- [ ] Time zones: "today" is the supervisor's device's day; wrong if sites span WIB, WITA and WIT.
- [ ] One-time codes by WhatsApp instead of SMS (Supabase supports it only through Twilio or Twilio Verify, with a WhatsApp sender approved by Meta).
- [ ] Self-service password reset with a texted code (the SMS provider is in place; needs a screen and a rule for who may use it).

### Portability: phone sign-in without Supabase

Phone sign-in currently leans on Supabase Auth features that other backends don't have in the same form. If the project ever moves off Supabase (or wants to drop the paid SMS provider), refactor these first:

- [ ] The phone number lives twice: `auth.users.phone` (what Supabase signs in with) and `profiles.phone` (what the app shows). The Edge Functions keep them in step. Make `profiles.phone` the only source of truth and treat the auth identity as a detail of `backend.ts`.
- [ ] Sign-in calls `signInWithPassword({ phone })` ([src/data/backend.ts](src/data/backend.ts)), which Supabase only allows once an SMS provider is configured, even though no text is sent. Option: sign in with an internal identity derived from the number (e.g. `6281234567890@phone.patroli.invalid`) plus the password. Plain email + password works on any auth system and needs no SMS provider.
- [ ] One-time codes use Supabase's `signInWithOtp` / `verifyOtp` ([supabase/functions/_shared/phone.ts](supabase/functions/_shared/phone.ts)), with the SMS provider set in the Supabase dashboard. Option: own codes (a table of hashed codes with an expiry and attempt count) sent through any SMS gateway, so the provider can change without touching sign-in.
- [ ] `normalizePhone` exists twice ([src/lib/phone.ts](src/lib/phone.ts) and `supabase/functions/_shared/phone.ts`) because Edge Functions can't import from `src/`. A new backend should keep one copy.
- [ ] Account management (`create-guards`, `reset-password`, `staff-phone`) uses the Supabase Auth admin API with the service-role key. Keep their request and response shapes, so only the server side changes and `backend.ts` stays the one file the app talks through.

## Known limits (by design, to discuss)

- A signed QR stops typed or guessed codes, but not a photo of the sticker. "Replace sticker" invalidates a copied one once you know; next layers would be a GPS check or a minimum time between checkpoints.
- `scannedAt` uses the phone clock. `receivedAt` is the server's; a big gap flags offline scans or a changed clock.
