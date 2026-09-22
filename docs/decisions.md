# Decisions

Newest first. Each entry says what was decided, why, and what it costs.

## 2026-09-22: Remove scan photos; keep report photos only
- **Decision:** The scanner reads the QR code and stores no image. Photos exist only in optional reports (0 to 5 per report).
- **Why:** Less mobile data for guards, less storage, fewer steps per checkpoint.
- **Cost:** Scan photos were the main evidence against a guard scanning a saved photo of a code while using a fake-GPS app. That is now caught only by patterns (identical positions, travel speed, timing), unannounced supervisor checks, CCTV, and the site Wi-Fi check once built. The site Wi-Fi check moves up in priority.
- **Follow-on:** With no photo to keep sharp, the scanner reads the code automatically as soon as the chosen checkpoint's code is in view. The Capture button is removed. (Revert if M prefers a manual button.)

## 2026-09-22: Weekly backup to Google Sheets and Excel
- **Decision:** A weekly export writes the week's scans, reports, missed checkpoints and a summary to a Google Sheet and to an .xlsx file, and copies report photos to Google Drive.
- **Why:** The Supabase free plan has no automatic backups; the owner is comfortable with spreadsheets.
- **Cost:** Up to a week of data could be lost if the Supabase project were lost. The log fingerprint is anchored outside the database weekly instead of nightly.

## 2026-09-21: PostgreSQL on Supabase (free tier, Singapore)
- **Why:** Relational data (guards, checkpoints, assignments, scans, reports); one platform gives database, storage, server functions, supervisor logins and scheduled jobs; no credit card; close to Indonesia; standard Postgres avoids lock-in.
- **Rejected:** Firebase (document database, server functions need billing), Cloudflare D1 + R2 (R2 needs a card), Neon (database only), PocketBase (needs a paid server).
- **Limits checked 2026-09:** 500 MB database, 1 GB file storage, 5 GB egress a month, 500,000 Edge Function calls a month, projects pause after 7 days of no activity, no automatic backups. Re-check before relying on them.

## 2026-09-21: Guard taps an assigned checkpoint, confirms, scans, then may report
- The home screen lists only the guard's assigned checkpoints. "Start scan?" Yes/No. The scanner accepts only the chosen checkpoint's code. A rejected scan skips the report question.

## 2026-09-20: Web app, no framework, no native app, no NFC
- **Why:** Must be lightweight for old phones and cheap to maintain; not all guards' phones have NFC.
- **Cost:** A browser cannot detect fake-GPS apps or check device integrity. Compensated by server-side patterns, supervision, CCTV and (planned) the site Wi-Fi check.

## 2026-09-20: Plain JavaScript with JSDoc types, checked by tsc
- **Why:** Type safety without a build step; the files the browser runs are the files in the repo.
