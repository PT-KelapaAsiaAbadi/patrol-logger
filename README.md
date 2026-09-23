# Patroli (prototype)

QR checkpoint patrol logger. Guards scan stickers on their round; supervisors see the log.

## Run

```bash
npm install
npm run dev            # http://localhost:5173 (camera works on localhost)
npm run build          # hosted build with service worker, installable as a PWA
npm run build:single   # one self-contained index.html
```

To test on a real phone, the page must be served over **https** (the camera is blocked on plain http).
Easiest: `npm run build`, then drag `dist/` into Netlify Drop or Cloudflare Pages.

Demo accounts: `budi` / `agus` / `dewi` with PIN `1234` (guards), `rina` with PIN `5678` (supervisor).

## Stack

| Concern | Choice | Why |
|---|---|---|
| UI | Preact + TypeScript | React API you already know, about 4 KB |
| Routing | wouter-preact | about 2 KB, hash routing needs no server config |
| Styling | Tailwind v4 | tokens in `index.css`, no runtime cost |
| QR scanning | qr-scanner | native BarcodeDetector when available, worker fallback |
| QR generation | qrcode | supervisor label sheet |
| Offline / install | vite-plugin-pwa | caches the app shell, adds manifest |

Whole app: about 52 KB gzipped.

## Layout

```
src/
  types.ts              shapes shared by everything (mirror your future tables)
  i18n.ts               Bahasa Indonesia + English strings
  data/
    backend.ts          MOCK SERVER. Replace with Supabase. Nothing else imports it except api.ts
    api.ts              what pages call. Decides: send now, or park in the outbox
    queue.ts            offline outbox (runs on the phone, stays in production)
    network.ts          online/offline state (+ prototype "simulate" switch)
  lib/
    scanner.ts          camera + QR decode, isolated so you can rebuild it by hand
    image.ts            shrinks photos before upload
    labels.ts           printable QR sticker sheet
    csv.ts, download.ts, format.ts, id.ts
  pages/guard/          Home (round), Scan, Report
  pages/supervisor/     Log (paginated), ScanDetail, Checkpoints (QR labels)
```

## Moving to Supabase

Each function in `backend.ts` has a direct replacement:

| backend.ts | Supabase |
|---|---|
| `signIn` | `supabase.auth.signInWithPassword` |
| `submitScan` | Edge Function: verify HMAC with secret from env, then insert |
| `listScans` | `.from('scan_rows').select('*', { count: 'exact' }).range(from, to)` |
| `guardSummaries`, `missedCheckpoints` | SQL views or RPC functions |
| role checks marked "RLS" | Row Level Security policies |
| report photos (data URLs) | Storage bucket, store object paths |

Also for production: move `queue.ts` from localStorage to IndexedDB (`idb`), and delete `PrototypeBar`.

## Known limits (by design, to discuss)

- A signed QR stops typed or guessed codes, but not a photo of the sticker. Next layers: GPS check, minimum time between checkpoints.
- `scannedAt` uses the phone clock. `receivedAt` is the server's; a big gap flags offline scans or a changed clock.
