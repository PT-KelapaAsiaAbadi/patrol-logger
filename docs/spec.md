# Specification

This describes the system as it should behave after Phase 1. Keep it in sync with the code.

## Roles

| Role | Uses | Can do |
|---|---|---|
| Guard | Guard web app on their own phone | Scan assigned checkpoints, send reports, see their own recent activity |
| Supervisor | Dashboard | See rounds, review flagged scans, read reports, create enrollment codes |
| Owner (admin) | Dashboard | Everything a supervisor can, plus manage guards, checkpoints, assignments, rounds and rules |

## Guard flow

1. **Enroll the phone** once with a 6-digit code from a supervisor (valid 30 minutes, 5 wrong attempts cancels it). The browser creates a non-extractable ECDSA P-256 key; the server stores the public key. Enrolling again replaces the old phone.
2. **Start a shift** with a PIN (4 to 8 digits, 5 wrong attempts locks the guard). The request is signed by the phone. The shift login lasts 12 hours.
3. **Home screen** lists the guard's assigned, active checkpoints with their status in the current round: `Not yet`, `Done 22:08`, `Done by Sari`, or `Tap to scan` outside round hours. There is no general scan button.
4. **Tap a checkpoint** to open a dialog: "Start scan?" with the checkpoint name, **No** and **Yes**.
5. **Yes opens the camera.** It reads codes continuously and accepts only the chosen checkpoint's code. A different checkpoint's code shows "That code belongs to a different checkpoint. Scan the code at {name}." No image is stored. Location is collected while the camera is open (wait up to 10 s for accuracy of 30 m or better).
6. **The scan is signed and sent** (or queued without signal).
   - Rejected: show "Not recorded" and the reason; no report question.
   - Recorded, flagged, or queued: go to step 7.
7. **"Do you have anything to report?"** No returns home. Yes opens the form:
   - Note: optional, up to 2000 characters.
   - Photos: optional, up to 5, picked with the phone camera suggested; each shrunk to at most 800 px JPEG quality 0.6.
   - Sending needs a note or at least one photo.
8. **Result screen**, then home. Queued scans and reports upload in order when signal returns.

The prototype keeps a "simulated scan" mode for testing without a camera; it must never be enabled in production builds.

## Scan checks and flags

Checks run on the server. A flag never blocks a scan unless noted.

| Flag | Rule | Review priority |
|---|---|---|
| `BAD_CODE` | Code is not the current code (`GP1`, checkpoint ID, token) of an active checkpoint. **Rejects.** | High |
| `NO_GPS` | No location sent. **Rejects.** | High |
| `REPLAYED` | Phone sequence number already used. **Rejects.** | High |
| `OUT_OF_RANGE` | Distance minus reported accuracy exceeds the checkpoint radius. Rejects only if the "reject clearly out of range" rule is on and accuracy is 30 m or better. | High |
| `IMPOSSIBLE_TRAVEL` | Faster than 40 km/h from the guard's previous scan (over 0.2 km apart). | High |
| `SAME_TIME_AS_OTHER_GUARD` | Another guard scanned the same checkpoint within 60 s. | High |
| `IDENTICAL_POSITION` | Exactly the same coordinates as an earlier scan by this guard more than 5 minutes apart. | High |
| `MISSING_SCANS` | Phone sequence number skipped ahead. | High |
| `CHAIN_BROKEN` | Request's previous-hash does not match the phone's last request. | High |
| `PHONE_CLOCK_AHEAD` | Phone time more than 2 minutes ahead of the server. | High |
| `LOW_ACCURACY` | GPS accuracy worse than 100 m. | Minor |
| `DUPLICATE` | Same guard, same checkpoint within 3 minutes. | Minor |
| `LATE_SYNC` | Received more than 10 minutes after it was taken. | Minor |
| `NO_GEOFENCE` | Checkpoint has no location. | Minor |
| `CALIBRATED` | A supervisor's scan (accuracy 30 m or better) set the checkpoint location. | Minor |

Removed with scan photos: `REUSED_PHOTO` (for scans), `PHOTO_GAP`, `NO_PHOTO`, `NO_AREA_PHOTO`, `DARK_PHOTO`, `BLURRY_PHOTO`, and the "require area photo" rule.

## Report checks

| Flag | Rule |
|---|---|
| `OLD_REPORT_PHOTO` | A photo's timestamp is more than 10 minutes before the scan it follows. |
| `REUSED_REPORT_PHOTO` | A photo identical to one in an earlier report. |
| `LATE_SYNC` | Received more than 10 minutes after it was written. |

Server validation: note up to 2000 characters, 0 to 5 photos, at least a note or one photo, each photo at most 1 MB, photo hashes match the signed request, the scan exists and belongs to the same guard.

## Rounds

- Settings: patrol start (default 22:00), end (06:00), interval (120 minutes). A night runs noon to noon, so a 02:00 scan belongs to the previous evening.
- Each round window requires one accepted scan of every checkpoint assigned to at least one guard on shift.
- Cell statuses: done, flagged (has a high-priority flag), later, due, missed.
- **Rushed round:** all checkpoints done, and the spread from first to last scan is under 70% of the shortest realistic walk: shortest path through the checkpoints (exact search up to 8 points, nearest neighbour above), times 1.3 for real paths, at 3 km/h, plus 1 minute per checkpoint.

## Data model (Postgres)

All times are `timestamptz`. IDs are text where people read them (`G01`, `CP03`), UUID elsewhere.

- **sites**: id, name, timezone (default `Asia/Jakarta`), rules (jsonb: radius default, thresholds, reject-out-of-range), rounds (jsonb: start, end, interval).
- **guards**: id (text), site_id, name, role (`guard` | `supervisor`), active, failed_pins, pin_salt, pin_hash, created_at.
- **devices**: guard_id (unique), public_key (jsonb JWK), sequence, last_hash, enrolled_at. One active device per guard.
- **enrollment_codes**: guard_id, code_hash, expires_at, attempts, used_at.
- **shift_sessions**: id, guard_id, token_hash, expires_at, created_at (keep the previous session valid for 2 extra hours so queued uploads succeed).
- **checkpoints**: id (text), site_id, name, lat, lng, radius_m, token_hash, version, active.
- **assignments**: guard_id, checkpoint_id (no rows for a guard means all checkpoints).
- **scans** (append-only): scan_id (uuid, unique), guard_id, checkpoint_id, result (`accepted` | `rejected`), flags (text[]), taken_at (phone), received_at (server), lat, lng, accuracy_m, distance_m, prev_hash, hash.
- **reports**: report_id (uuid), scan_id, guard_id, checkpoint_id, note, written_at, received_at, flags (text[]).
- **report_photos**: report_id, position (1 to 5), storage_path, sha256, taken_at, bytes.
- **reviews**: scan_id, verdict (`fine` | `suspicious`), reviewer (auth user), reviewed_at.
- **staff**: auth user id, site_id, role (`supervisor` | `owner`). Links Supabase Auth users to dashboard permissions.
- **admin_audit**: who changed what (guard added, code replaced, assignment changed), when.
- **exports**: week_start, created_at, xlsx_path, sheet_url, last_log_hash.

Rules:
- Application roles may `insert` into `scans` but never `update` or `delete`. A trigger computes `hash = sha256(prev_hash || canonical row)`.
- Checkpoint tokens are stored hashed; the printable code is shown once when created or replaced (or regenerated from a secret kept only in Edge Function secrets).
- RLS: guards have no direct access. Staff read their site's data; only owners write configuration.

## Edge Functions (guard API)

Every guard request body is JSON, signed with the phone's key (`signature` header or field), and includes `guardId`.

| Function | Purpose |
|---|---|
| `enroll` | Guard ID, enrollment code, PIN, public key. Returns guard name and role. |
| `start-shift` | Signed: PIN, sentAt. Returns session token, expiry. |
| `guard-home` | Signed: session. Returns assigned checkpoints with current round status and recent activity. |
| `submit-scan` | Signed: session, sequence, previousHash, scanId, qr, lat, lng, accuracy, takenAt. Returns recorded / flagged (no flag details) / rejected with reason. |
| `submit-report` | Signed: session, reportId, scanId, note, photo hashes and timestamps; photos uploaded with it (multipart) or via signed upload URLs. |

Guards are told "Recorded" or "Recorded, will be reviewed", never which flag, so the checks are not advertised.

## Weekly export and backup

- **When:** Monday 07:00 site time (default `Asia/Jakarta`), covering the previous Monday 00:00 to Sunday 23:59. Configurable.
- **Contents (one tab or sheet each):** Summary (scans, missed checkpoints, rushed rounds, flagged scans, reports, per guard); Scans (every scan with flags); Missed checkpoints (round, checkpoint); Reports (note, checkpoint, guard, time, flags, photo file names); Log fingerprint (last hash of the week).
- **Excel:** `export-week` builds an .xlsx (SheetJS) and stores it in a private `exports` bucket; the dashboard lists the last 12 weeks with download links.
- **Google Sheets:** an Apps Script in the owner's Google account runs weekly, calls `export-week` with a secret key (kept in Script Properties), writes a new sheet named `Patrol YYYY-Www`, and copies that week's report photos to a Drive folder using short-lived signed URLs.
- **Retention:** scan rows kept indefinitely; report photos kept 1 year in Supabase (about 1 MB a day at 10 guards, well inside 1 GB), and permanently in Drive after the weekly copy.

## Storage estimate at 10 guards

About 200 scans a day with no photos is roughly 50 MB of database a year. Report photos at around 5 reports a day with 2 photos each is roughly 1 MB a day. Both fit the free tier for years.
