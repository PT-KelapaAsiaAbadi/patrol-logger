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
npx supabase db reset    # rebuild the local database from migrations + seed
npm run db:types         # regenerate database.types.ts from the local database
npm run build            # hosted build with service worker, installable as a PWA
```

To test on a real phone, the page must be served over **https** (the camera is blocked on plain http).
Easiest: `npm run build`, then drag `dist/` into Netlify Drop or Cloudflare Pages.

## Hosted project (PatrolLogger)

```bash
npx supabase link --project-ref cfiayahvwjjqhmayakmy
npx supabase db push                          # applies supabase/migrations (never seed.sql)
npx supabase functions deploy create-guards
```

Then in the dashboard:

1. **Authentication > Sign In / Providers**: turn off "Allow new users to sign up". Accounts are only made by supervisors.
2. **Authentication > Users > Add user**: create the first supervisor with "Auto Confirm User" ticked.
3. **SQL Editor**: give that account a supervisor profile:

   ```sql
   insert into public.profiles (id, name, email, role)
   select id, 'Supervisor name', email, 'supervisor' from auth.users where email = 'you@example.com';
   ```

From then on, supervisors add guards from the Guards tab.

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | Preact + TypeScript | React API you already know, about 4 KB |
| Routing | wouter-preact | about 2 KB, hash routing needs no server config |
| Styling | Tailwind v4 | tokens in `index.css`, no runtime cost |
| QR scanning | qr-scanner | native BarcodeDetector when available, worker fallback |
| QR generation | qrcode | supervisor label sheet |
| Offline / install | vite-plugin-pwa | caches the app shell, adds manifest |
| Backend | Supabase | Postgres + Row Level Security, Auth, Storage, one Edge Function |

Whole app: about 100 KB gzipped, most of it supabase-js. The service worker caches it after the first visit.

## Layout

```
src/
  types.ts              shapes shared by everything (camelCase mirror of the tables)
  i18n.ts               Bahasa Indonesia + English strings
  data/
    backend.ts          Supabase calls. Nothing else imports it except api.ts
    api.ts              what pages call. Decides: send now, or park in the outbox
    queue.ts            offline outbox (runs on the phone, stays in production)
    network.ts          online/offline state
  lib/
    scanner.ts          camera + QR decode, isolated so you can rebuild it by hand
    image.ts            shrinks photos before upload
    labels.ts           printable QR sticker sheet
    csv.ts              scan export, guard CSV import
    print.ts            prints a label sheet through a hidden iframe
    download.ts, format.ts, id.ts
  pages/guard/          Home (round), Scan, Report
  pages/supervisor/     Log (paginated), ScanDetail, Guards (add one or import CSV), Checkpoints (add, select, print QR)
supabase/
  migrations/           tables, Row Level Security, server functions, QR signing key, photo bucket
  functions/create-guards/  creates guard logins with generated passwords (service-role key)
  seed.sql              local test accounts and checkpoints
```

## How the backend works

| backend.ts | Supabase |
|---|---|
| `signIn` | `supabase.auth.signInWithPassword`, then the caller's row in `profiles` (role, active) |
| `createGuards` | `create-guards` Edge Function: `auth.admin.createUser` with a generated password, then a `profiles` row |
| `submitScan` | `submit_scan()`: verifies the QR's HMAC with a key kept in Vault, or matches the manual code, then inserts. The guard is always the caller |
| `submitReport` | photos uploaded to the private `report-photos` bucket, then `submit_report()` stores their paths |
| `qrPayloadFor` | `qr_payload()`, supervisors only |
| `createCheckpoint` | `create_checkpoint()`: next route position and a unique manual code |
| `listScans`, `exportScans`, `getScan` | the `scan_rows` view, paged with `.range()`; photos shown via signed URLs |
| `guardSummaries`, `missedCheckpoints` | `guard_summaries()`, `missed_checkpoints()` |

Row Level Security: guards read only their own profile, scans and reports; supervisors read everything. Guards never see manual codes. No table accepts writes from the app directly: every write goes through a function that checks the caller.

## TODO

Open work, mirrored from the code. `TODO:` comments and `not implemented:` stubs are highlighted in the editor by the TODO Highlight extension (`.vscode/settings.json`). Tick an item here when you resolve it in the code.

### Storage

- [ ] Outbox to IndexedDB (`idb`), so queued report photos don't hit localStorage's ~5 MB limit ([src/data/queue.ts](src/data/queue.ts)).

### Guard accounts

- [ ] Password reset: a guard who loses their password needs a supervisor action (for example a "new password" button calling the Edge Function). For now, reset it in the dashboard.
- [ ] Deactivating a guard: set `profiles.active = false` in the dashboard for now; there's no button yet.

## Known limits (by design, to discuss)

- A signed QR stops typed or guessed codes, but not a photo of the sticker. Next layers: GPS check, minimum time between checkpoints.
- `scannedAt` uses the phone clock. `receivedAt` is the server's; a big gap flags offline scans or a changed clock.
