# Guard patrol prototype

> Continuing development with Claude Code? Start with `CLAUDE.md` and `docs/claude-code-setup.md`. Phase 1 of `docs/implementation-plan.md` is done: scans carry no photo, and the camera records on its own. Phase 2 is next.

A QR-code patrol prototype with three views: a guard web app, a supervisor dashboard, and a setup page. The server checks are simulated in the browser, and all data stays in that browser. In production, the `js/server` logic moves to a Supabase Edge Function.

## Project structure

```text
index.html                 Page markup only; loads the CSS files and js/main.js
css/
  base.css                 Design tokens, light/dark themes, layout, forms, buttons, tables
  dashboard.css            Watch-clock dials and the review list
  setup.css                Printable code cards and print rules
  guard.css                Guard app (night palette) and the camera scanner
js/
  main.js                  Entry point: loads data and wires up the three views
  config.js                Every tunable number and storage key in one place
  types.js                 JSDoc type definitions shared by all modules
  app/navigation.js        Switching between views
  lib/                     Small, app-independent helpers
    dom.js                   Element builders and query shorthands
    format.js                Times, dates, durations, plurals
    crypto.js                Hashing, tokens, device signing keys, PIN hashing
    geo.js                   Distances and position offsets
    storage.js               localStorage and IndexedDB wrappers with fallbacks
    async.js                 sleep()
  domain/                  Patrol rules that do not depend on the UI
    flags.js                 Flag names, descriptions, and which ones need review
    rounds.js                Night schedules, shortest realistic round, round results
    synthetic-photo.js       Placeholder photos for simulated scans and the demo
  server/                  The simulated backend
    server.js                Requests: enroll, start shift, submit scan; runs the checks
    checks.js                The scan checks as small functions that only return flags
    log.js                   Append-only, hash-chained log and its verification
    state.js                 Creating, loading and saving server data
  guard/                   The guard's phone
    guard-app.js             Routing between screens, phone setup, starting and ending a shift
    screens.js               Showing a screen, and the shared result screen
    home-screen.js           The guard's assigned checkpoints for the current round, and recent activity
    scan-flow.js             Tap a checkpoint, confirm, then camera or simulator, then the report question
    scanner.js               Continuous code reading; only the chosen checkpoint's code is accepted
    image-tools.js           Grabbing a camera frame and reading a QR code from it
    report-screen.js         "Anything to report?" and the report form (note, 0 to 5 photos)
    report-photos.js         Shrinking report photos to save mobile data
    uploads.js               Signing scans and reports, sending them, the offline queue
    simulated-scan.js        Building scans without a camera, for testing
    device.js                The phone's identity, signing key and upload queue
  dashboard/               Supervisor dashboard
    dashboard.js             Rounds table, each guard's night, review list, log check
    watch-dial.js            One guard's night drawn as a watch-clock disc
    review-item.js           One flagged scan with its measurements and decision buttons
    report-item.js           One report from a guard, with its photos and warnings
  setup/setup.js           Guards, checkpoints, assignments, rounds, scan rules, printable codes
  demo/demo-site.js        The demo site and the recorded night
tests/
  e2e.py                   End-to-end test in headless Chromium (46 checks)
  make_fake_camera.py      Fake camera video of the demo Main gate code
  requirements.txt         Python packages for the tests
tools/
  build-single-file.mjs    Bundles everything into one HTML file (npm run build)
```

## The guard's flow

1. After starting a shift, the home screen lists the checkpoints assigned to the guard for the current round, each showing whether it has been scanned. There is no general scan button.
2. Tapping a checkpoint asks **Start scan?** with **Yes** and **No**.
3. **Yes** opens the camera. It reads codes continuously and records the scan as soon as that checkpoint's code is in view, with no button to press; another checkpoint's code is refused with a message. No image is kept: frames are decoded and discarded. Location is collected while the camera is open.
4. After a recorded or saved scan, the app asks **Do you have anything to report?** A rejected scan shows why instead.
5. **Yes** opens a form with an optional note and optional photos. A report needs at least one of the two, and can have 1 to 5 photos when photos are added.
6. Reports are signed by the phone like scans, wait on the phone without signal, and appear on the dashboard under *Reports from guards*. A report photo taken more than 10 minutes before its scan is flagged, and so is one that was already sent with an earlier report.

Supervisors choose which checkpoints each guard sees under **Setup → Assignments**.

Modules import each other in one direction: `lib` depends on nothing, `domain` on `lib`, `server` on both, and the UI folders (`guard`, `dashboard`, `setup`, `demo`) on everything below them.

## Run the app

The app uses ES modules, and the camera, location and signing key only work on `https://` or `localhost`, so serve the folder rather than opening `index.html` directly:

```bash
npm start            # or: python -m http.server 8000
# open http://localhost:8000
```

`npm start` and `npm test` run Python through `tools/python.mjs`, which picks whichever of `python`, `py` or `python3` this machine has, so the same commands work on Windows, macOS and Linux.

There is no build step. To use it on a phone, upload the folder to any static HTTPS host, such as GitHub Pages or Cloudflare Pages.

For hosts that accept only one HTML file, such as a Claude artifact, `npm run build` bundles everything into `dist/patrol-prototype.html` with esbuild: the CSS files are inlined and the JavaScript modules are combined into one inline module script. The two QR libraries and the font still load from their CDNs.

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
| esbuild | `npm run build` | Bundles the single-file version in `dist/` |

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
