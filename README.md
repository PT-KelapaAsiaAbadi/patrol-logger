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

`.env.local` points the app at a Supabase project (git ignores it). For the local stack, use the values from `supabase status`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key from supabase status>
```

Local accounts from `supabase/seed.sql` (password `patroli-local-1`): `supervisor@patroli.test`, `guard@patroli.test`.

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
```

Then in the dashboard:

1. **Authentication > Sign In / Providers**: turn off "Allow new users to sign up". Accounts are only made by supervisors.
2. **Authentication > Users > Add user**: create the first supervisor with "Auto Confirm User" ticked.
3. **SQL Editor**: give that account a supervisor profile:

   ```sql
   insert into public.profiles (id, name, email, role)
   select id, 'Supervisor name', email, 'supervisor' from auth.users where email = 'you@example.com';
   ```

From then on, supervisors add guards (and other supervisors) from the Accounts tab.

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | Preact + TypeScript | React API you already know, about 4 KB |
| Routing | wouter-preact | about 2 KB, hash routing needs no server config |
| Styling | Tailwind v4 | tokens in `index.css`, no runtime cost |
| QR scanning | qr-scanner | native BarcodeDetector when available, worker fallback |
| QR generation | qrcode | supervisor label sheet |
| Offline / install | vite-plugin-pwa | caches the app shell, adds manifest |
| Backend | Supabase | Postgres + Row Level Security, Auth, Storage, two Edge Functions |
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
                        Checkpoints (round order, rename, replace sticker, add, select, print QR)
supabase/
  migrations/           tables, Row Level Security, server functions, QR signing key, photo bucket
  functions/            create-guards, reset-password (service-role key), _shared/
  seed.sql              local test accounts and checkpoints
tests/                  backend.test.mjs (each role against the API), e2e.test.mjs (the app in a browser),
                        camera.test.mjs (a real camera scan, using the browser's fake camera showing a QR sticker),
                        location.test.mjs (location messages with scripted GPS; a refused scan isn't "no signal")
```

## How the backend works

| backend.ts | Supabase |
|---|---|
| `signIn` | `supabase.auth.signInWithPassword`, then the caller's row in `profiles` (role, active) |
| `createGuards` | `create-guards` Edge Function: `auth.admin.createUser` with a generated password, then a `profiles` row (guard or supervisor) |
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
|---|---|
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

- [ ] Deploy the backend to PatrolLogger (commands above), then in the dashboard: turn off sign-up, set the minimum password length to 10 and the site URL to the app's address, create the first supervisor.
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

### Decisions (not built)

- [ ] Shifts: "missed checkpoints" is per calendar day, so a night shift over midnight is split and rounds within a shift aren't tracked.
- [ ] Several sites or routes (there's one route for everyone).
- [ ] Alerts to supervisors for incident reports or missed checkpoints.
- [ ] Time zones: "today" is the supervisor's device's day; wrong if sites span WIB, WITA and WIT.
- [ ] Self-service password reset by email (needs custom SMTP).

## Known limits (by design, to discuss)

- A signed QR stops typed or guessed codes, but not a photo of the sticker. "Replace sticker" invalidates a copied one once you know; next layers would be a GPS check or a minimum time between checkpoints.
- `scannedAt` uses the phone clock. `receivedAt` is the server's; a big gap flags offline scans or a changed clock.
