# Guard patrol prototype

> Continuing development with Claude Code? Start with `CLAUDE.md` and `docs/claude-code-setup.md`. Phase 1 and Phase 2 step a of `docs/implementation-plan.md` are done. Step b (standard test tools, no Python) is next.

A QR-code patrol prototype built as two apps: a guard web app for phones, and a staff app holding the supervisor dashboard and setup. They share code through `shared/` and never import each other. The server checks are simulated in the browser, and all data stays in that browser. In production, the `shared/checks` logic moves to a Supabase Edge Function.

## Project structure

```text
apps/
  guard/                   Guard app: enrollment, shift, checkpoints, scanner, reports
    index.html               Guard screens, the scan dialog and the camera overlay
    src/
      main.js                Entry point
      api.js                 The app's only door to the backend
      guard-app.js           Routing between screens, phone setup, starting and ending a shift
      screens.js             Showing a screen, and the shared result screen
      home-screen.js         Assigned checkpoints for the current round, and recent activity
      scan-flow.js           Tap a checkpoint, confirm, then camera or simulator, then the report question
      scanner.js             Continuous code reading; only the chosen checkpoint's code is accepted
      image-tools.js         Grabbing a camera frame and reading a QR code from it
      report-screen.js       "Anything to report?" and the report form (note, 0 to 5 photos)
      report-photos.js       Shrinking report photos to save mobile data
      uploads.js             Signing scans and reports, sending them, the offline queue
      device.js              The phone's identity, signing key and upload queue
      dev/simulated-scan.js  Building scans without a camera, for testing
    styles/guard.css         Guard app (night palette) and the camera scanner
  staff/                   Staff app: dashboard and setup
    index.html               Dashboard and Setup tabs
    src/
      main.js                Entry point
      api.js                 The app's only door to the backend
      navigation.js          Switching between the two tabs
      dashboard/             Rounds table, each guard's night, review list, reports, log check
      setup/                 Guards, checkpoints, assignments, rounds, scan rules, printable codes
      dev/demo-tools.js      The demo site, wired to this app
    styles/                  dashboard.css, setup.css
shared/                    Used by both apps, and later by the Edge Functions
  config.js                  Every tunable number and storage key in one place
  types.js                   JSDoc type definitions
  lib/                       dom, format, crypto, geo, storage, async
  domain/                    flags.js (flag names and descriptions), rounds.js (night schedules, rushed rounds)
  checks/                    checks.js (the scan checks), log.js (the hash-chained log)
  styles/base.css            Design tokens, light/dark themes, layout, forms, buttons, tables
dev/                       Development only, never in a production build
  mock-backend/              server.js, state.js: the in-browser backend
  demo-site.js               The demo site and its recorded night
  synthetic-photo.js         Placeholder report photos for the demo
  demo-shell/                Both apps as tabs, for demos and the single-file build
tests/
  e2e.py                     End-to-end test in headless Chromium (46 checks)
  make_fake_camera.py        Fake camera video of the demo Main gate code
  requirements.txt           Python packages for the tests
tools/
  build.mjs                  dist/guard/ and dist/staff/ (npm run build)
  build-demo.mjs             dist/patrol-demo.html, both apps in one file (npm run build:demo)
  lib/build-app.mjs          Bundles one app into a single self-contained file
  python.mjs                 Runs Python with whichever launcher the machine has
```

Each app is bundled from its own entry point, and the build fails if one app's
code reaches the other. ESLint enforces the same rule while you edit: the apps
import only from `shared/`, each app's `src/api.js` is the single place that
touches `dev/mock-backend`, and `shared/` never imports from an app.

## The guard's flow

1. After starting a shift, the home screen lists the checkpoints assigned to the guard for the current round, each showing whether it has been scanned. There is no general scan button.
2. Tapping a checkpoint asks **Start scan?** with **Yes** and **No**.
3. **Yes** opens the camera. It reads codes continuously and records the scan as soon as that checkpoint's code is in view, with no button to press; another checkpoint's code is refused with a message. No image is kept: frames are decoded and discarded. Location is collected while the camera is open.
4. After a recorded or saved scan, the app asks **Do you have anything to report?** A rejected scan shows why instead.
5. **Yes** opens a form with an optional note and optional photos. A report needs at least one of the two, and can have 1 to 5 photos when photos are added.
6. Reports are signed by the phone like scans, wait on the phone without signal, and appear on the dashboard under *Reports from guards*. A report photo taken more than 10 minutes before its scan is flagged, and so is one that was already sent with an earlier report.

Supervisors choose which checkpoints each guard sees under **Setup → Assignments**.

Modules import each other in one direction: `shared/lib` depends on nothing, `shared/domain` on `lib`, `shared/checks` on both, and the two apps on `shared/` only.

## Run the app

The app uses ES modules, and the camera, location and signing key only work on `https://` or `localhost`, so serve the folder rather than opening `index.html` directly:

```bash
npm start
# guard app:  http://127.0.0.1:8000/apps/guard/
# staff app:  http://127.0.0.1:8000/apps/staff/
# both:       http://127.0.0.1:8000/dev/demo-shell/
```

Both apps are served from one origin in development, so they share the mock
backend's storage. In production they live on separate origins and share data
only through Supabase.

`npm start` and `npm test` run Python through `tools/python.mjs`, which picks whichever of `python`, `py` or `python3` this machine has, so the same commands work on Windows, macOS and Linux.

There is no build step. To use it on a phone, upload the folder to any static HTTPS host, such as GitHub Pages or Cloudflare Pages.

`npm run build` writes `dist/guard/index.html` and `dist/staff/index.html`, one self-contained file per app, with the CSS inlined and the modules bundled by esbuild. For hosts that accept only one file, such as a Claude artifact, `npm run build:demo` writes `dist/patrol-demo.html` with both apps embedded. The two QR libraries and the font still load from their CDNs.

## Why JavaScript with JSDoc instead of TypeScript

The code is plain JavaScript with JSDoc type annotations, checked by the TypeScript compiler in strict mode (`npm run typecheck`). This gives type checking in the editor and in CI without a build step, so the files that run in the browser are exactly the files in this folder. Converting to `.ts` later is mostly mechanical.

## Dependencies

**Runtime** (loaded from CDNs, nothing to install):

| Dependency | Version | Used for |
|---|---|---|
| jsQR (cdn.jsdelivr.net) | 1.4.0 | Reading QR codes when the browser has no built-in reader |
| qrcode-generator (cdnjs.cloudflare.com) | 1.4.4 | Drawing the printable checkpoint codes |
| Public Sans (Google Fonts) | current | Typeface; falls back to system fonts |

Browser features: ES modules, camera (`getUserMedia`), Geolocation, WebCrypto (SHA-256, ECDSA P-256), IndexedDB, localStorage, Canvas, and `BarcodeDetector` where available. Target: Chrome on Android 10 or newer.

**Code quality tools** (`npm install`, Node 18 or newer):

| Tool | Command | Purpose |
|---|---|---|
| ESLint 9 | `npm run lint` | Recommended rules plus limits on function length and complexity |
| TypeScript 5 | `npm run typecheck` | Strict type checking of the JSDoc annotations |
| Prettier 3 | `npm run format` | Consistent formatting |
| esbuild | `npm run build` | Bundles each app into a single file in `dist/` |

**Tests** (Python 3.10 or newer):

```bash
pip install -r tests/requirements.txt
playwright install chromium
npm test             # makes the fake camera video, then runs tests/e2e.py
```

Optional environment variables: `CHROME_PATH` for a specific browser binary, and `PATROL_LIB_DIR` to serve local copies of `jsQR.js` and `qrcode.js` when there is no internet access.

## Tools for the production version

- A Supabase project (free tier, Singapore region) and the Supabase CLI, for the database, photo storage and the scan Edge Function (Deno)
- Google Apps Script, for the Google Sheets report
- A static HTTPS host for the guard app and dashboard
- Git

## Known limits

- The checks run in the browser, so a technical user could bypass them. They show the logic the server will run.
- Each browser keeps its own data; nothing syncs between devices.
- Interface text is English only.
- Report photos come from the phone's photo picker with the camera suggested. Some phones also allow the gallery, so an old-photo flag is raised instead of blocking it.
- Scans carry no photo, so a guard using a fake-location app and a saved copy of a code is caught only by patterns (identical positions, travel speed, timing) until the site Wi-Fi check of phase 8 exists. See `docs/decisions.md`.
- Reports are signed by the phone but are not part of the log's hash chain yet.
