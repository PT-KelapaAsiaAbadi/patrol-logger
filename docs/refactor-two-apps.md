# Refactor brief: split into a guard app and a staff app

Part of Phase 2. Read `CLAUDE.md` first. Behaviour must not change: every existing end-to-end check keeps passing.

## Why

The prototype is one web app with three views. In production the audiences are different:

| | Guard app | Staff app |
|---|---|---|
| Users | Guards | Supervisors and the owner |
| Device | Old Android phones, mobile data | Mostly laptops |
| Login | Phone signing key + PIN | Email login (Supabase Auth, Phase 6) |
| Contains | Enrollment, shift, checkpoints, scanner, reports | Dashboard, setup (guards, checkpoints, assignments, rounds, rules, printable codes) |

Splitting keeps admin code off guards' phones, keeps the guard app small, and separates two login models.

## Target structure

```text
apps/
  guard/
    index.html          guard screens, scan dialog, scanner only
    src/main.js         entry: mountGuardApp()
    src/...             the current js/guard/* modules
    src/dev/            simulated scans (development only)
    styles/guard.css
  staff/
    index.html          tabs: Dashboard, Setup
    src/main.js         entry: mountStaffApp()
    src/dashboard/      the current js/dashboard/*
    src/setup/          the current js/setup/*
    src/navigation.js   the current js/app/navigation.js (Dashboard and Setup only)
    src/dev/            demo-site buttons, tamper test (development only)
    styles/dashboard.css, styles/setup.css
shared/
  config.js, types.js, strings.js (added in Phase 2 step d)
  lib/                  the current js/lib/*
  domain/               the current js/domain/*
  checks/               the current js/server/checks.js and log.js (used later by Edge Functions)
  styles/base.css       tokens, reset, forms, buttons, tables
dev/
  mock-backend/         the current js/server/server.js and state.js: the in-browser backend
  demo-site.js          the current js/demo/demo-site.js
  demo-shell/           one page with both apps side by side as tabs, for demos and the Claude artifact
tests/
tools/
```

## Where each current file goes

| Current | New |
|---|---|
| `js/guard/*` | `apps/guard/src/*` (except `simulated-scan.js` -> `apps/guard/src/dev/`) |
| `js/dashboard/*` | `apps/staff/src/dashboard/*` |
| `js/setup/setup.js` | `apps/staff/src/setup/` (split into smaller modules in step d) |
| `js/app/navigation.js` | `apps/staff/src/navigation.js` |
| `js/lib/*`, `js/domain/*`, `js/config.js`, `js/types.js` | `shared/` |
| `js/server/checks.js`, `js/server/log.js` | `shared/checks/` |
| `js/server/server.js`, `js/server/state.js` | `dev/mock-backend/` |
| `js/demo/demo-site.js` | `dev/demo-site.js` |
| `js/main.js` | replaced by `apps/guard/src/main.js`, `apps/staff/src/main.js`, `dev/demo-shell/` |
| `css/base.css` | `shared/styles/base.css` |
| `css/guard.css`, `css/dashboard.css`, `css/setup.css` | the matching app's `styles/` |
| `index.html` | split into `apps/guard/index.html` and `apps/staff/index.html` |

## Import rules (enforce with ESLint `no-restricted-imports`)

- `apps/guard` may import `shared` only (and its own `src/dev` in development builds).
- `apps/staff` may import `shared` only (and its own `src/dev` in development builds).
- The two apps never import each other.
- `shared` imports nothing from `apps` or `dev`.
- Only development entry points import `dev/`. Production builds must not contain it: add a check that fails the build if the output contains mock-backend code.
- Until the real backend exists (Phase 5), both apps reach the mock backend through one small interface module per app (`src/api.js`), never by importing `dev/mock-backend` directly from screens. In Phase 5 that module switches to the Edge Functions.

## Development server and storage

The mock backend keeps its data in browser storage, and browsers keep storage per origin. In development, serve everything from one origin so both apps see the same data:

```text
http://127.0.0.1:8000/apps/guard/
http://127.0.0.1:8000/apps/staff/
http://127.0.0.1:8000/dev/demo-shell/
```

In production the two apps live on separate origins (for example two Cloudflare Pages projects, or two subdomains). That is intended: their storage stays isolated, and they share data only through Supabase. The hosting choice is confirmed with M in Phase 9.

## Builds

- `npm run build` writes `dist/guard/` and `dist/staff/`, production only, without `dev/` code.
- `npm run build:demo` writes the single-file demo page (both apps plus the mock backend) used for the Claude artifact.

## Steps

Commit after each step, with all tests passing.

1. Create the folders and move files with `git mv` so history is kept. Update imports. No logic changes.
2. Split `index.html` and the CSS. Each app mounts into its own page.
3. Add `apps/*/src/api.js` so screens stop calling the mock backend directly.
4. Build the demo shell and `build:demo`; confirm the artifact version still works.
5. Add the ESLint import rules and the production build check.
6. Update the end-to-end tests to open the guard and staff pages instead of switching tabs in one page. Same checks, same results.

## Acceptance

- Every current end-to-end check has an equivalent that passes.
- `dist/guard/` contains no dashboard, setup, demo or mock-backend code; `dist/staff/` contains no guard screens.
- ESLint fails if a guard module imports staff code, or the reverse.
- The demo shell shows both apps, and the single-file demo still works.
- `README.md`, `CLAUDE.md` and `docs/spec.md` describe the new structure.
