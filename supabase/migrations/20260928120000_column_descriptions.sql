-- Descriptions for every table and column, shown in the Supabase dashboard (Table Editor) and by
-- tools that read the schema. Changes nothing else, and is safe to run again.
-- When a later migration adds or changes a column, add or update its comment here or in that migration.

-- ---------- profiles ----------

comment on table public.profiles is
	'One row per person who can use the app. Created only by supervisors (create-guards Edge Function); nobody can sign up.';
comment on column public.profiles.id is
	'Same id as the Supabase Auth user (auth.users.id). Deleting the Auth user deletes this row.';
comment on column public.profiles.name is
	'Full name, shown on the round, the log and the account list. 1 to 120 characters.';
comment on column public.profiles.email is
	'Only for accounts made before phone sign-in. New accounts have none. Can be dropped once every account has a phone.';
comment on column public.profiles.phone is
	'Sign-in phone number: digits with country code, no "+" (6281234567890). Same as auth.users.phone. Unique.';
comment on column public.profiles.phone_verified_at is
	'When the person proved the number is theirs with a one-time code. Not built yet, so always null for now (see README > TODO).';
comment on column public.profiles.role is
	'guard (scans checkpoints, sees only their own data) or supervisor (sees everything, manages accounts and checkpoints).';
comment on column public.profiles.active is
	'False = deactivated: cannot sign in and gets nothing from the database. Their scan history is kept.';
comment on column public.profiles.created_at is
	'When the account was created.';

-- ---------- checkpoints ----------

comment on table public.checkpoints is
	'Places on the patrol round, each with a QR sticker. Guards never read this table directly (route_checkpoints() hides manual codes).';
comment on column public.checkpoints.id is
	'Checkpoint id, part of the QR sticker text (PTRL1:<id>:<signature>). Never shown to guards.';
comment on column public.checkpoints.name is
	'Name guards and supervisors see, e.g. "Parkir basement B1". 1 to 80 characters.';
comment on column public.checkpoints.route_order is
	'Position in the patrol round (1 = first). Supervisors reorder it on the Checkpoints tab.';
comment on column public.checkpoints.manual_code is
	'Short code printed under the QR (e.g. K7P-4QX), typed in when the camera fails. Unique; no 0/O or 1/I. Changes when the sticker is replaced.';
comment on column public.checkpoints.qr_version is
	'Part of the QR signature. "Replace sticker" adds 1, so every copy of the old sticker stops working.';
comment on column public.checkpoints.active is
	'False = taken out of use: still listed for supervisors and can be put back, but scans of it are refused.';
comment on column public.checkpoints.created_at is
	'When the checkpoint was added.';
comment on column public.checkpoints.latitude is
	'Pinned position (degrees), set on the map by a supervisor. Null until pinned; set together with longitude.';
comment on column public.checkpoints.longitude is
	'Pinned position (degrees). Null until pinned; set together with latitude.';
comment on column public.checkpoints.radius_m is
	'How far from the pin (metres) a scan may be and still count as "at" the checkpoint. 10 to 1000, default 50.';
comment on column public.checkpoints.removed_at is
	'When a supervisor removed it. Removed checkpoints leave the round, lists and map, but old scans keep pointing at them.';

-- ---------- scans ----------

comment on table public.scans is
	'One row per checkpoint visit by a guard. Written only by submit_scan(), which checks the QR signature or manual code.';
comment on column public.scans.id is
	'Made on the guard''s phone, so resending the same scan after a lost connection never stores it twice.';
comment on column public.scans.checkpoint_id is
	'The checkpoint that was scanned.';
comment on column public.scans.guard_id is
	'The guard who scanned. Always the signed-in caller, never taken from the request.';
comment on column public.scans.scanned_at is
	'When the guard scanned, by the phone''s clock. The time that counts for the round, even if sent later.';
comment on column public.scans.received_at is
	'When the server received it (server clock). Later than scanned_at for scans sent after being offline.';
comment on column public.scans.latitude is
	'Phone''s position at the scan (degrees). Null when the phone had no usable GPS fix.';
comment on column public.scans.longitude is
	'Phone''s position at the scan (degrees). Null when the phone had no usable GPS fix.';
comment on column public.scans.accuracy_m is
	'The phone''s own estimate of its position error, in metres. Null without a position.';
comment on column public.scans.distance_m is
	'Metres between the phone and the checkpoint pin at scan time. Kept as it was, so moving the pin later doesn''t rewrite history.';
comment on column public.scans.location_status is
	'ok = within the radius; far = further (stored, not rejected); no_fix = no usable position; not_set = checkpoint not pinned.';

-- ---------- reports ----------

comment on table public.reports is
	'A note and optional photos a guard attaches to a scan. Written only by submit_report().';
comment on column public.reports.id is
	'Made on the guard''s phone, like scan ids, so a resent report is stored once.';
comment on column public.reports.scan_id is
	'The scan this report belongs to. Deleting the scan deletes the report.';
comment on column public.reports.note is
	'What the guard wrote. Up to 4000 characters; empty when only photos were sent.';
comment on column public.reports.photos is
	'Paths of the photos in the private report-photos Storage bucket (<guard id>/<report id>/<n>.jpg). Shown through signed links.';
comment on column public.reports.created_at is
	'When the guard wrote the report, by the phone''s clock.';

-- ---------- scan_rows (view) ----------

comment on view public.scan_rows is
	'Scans joined with guard and checkpoint names, the report and the checkpoint pin, for the supervisor log. Obeys the same access rules as scans.';
-- Views don't inherit column descriptions, so the columns copied from scans point back to it.
comment on column public.scan_rows.id is 'Same as scans.id.';
comment on column public.scan_rows.checkpoint_id is 'Same as scans.checkpoint_id.';
comment on column public.scan_rows.guard_id is 'Same as scans.guard_id.';
comment on column public.scan_rows.scanned_at is 'Same as scans.scanned_at: phone time of the scan.';
comment on column public.scan_rows.received_at is 'Same as scans.received_at: server time it arrived.';
comment on column public.scan_rows.latitude is 'Same as scans.latitude: the phone''s position at the scan.';
comment on column public.scan_rows.longitude is 'Same as scans.longitude: the phone''s position at the scan.';
comment on column public.scan_rows.accuracy_m is 'Same as scans.accuracy_m.';
comment on column public.scan_rows.distance_m is 'Same as scans.distance_m: metres from the pin at scan time.';
comment on column public.scan_rows.location_status is 'Same as scans.location_status (ok, far, no_fix, not_set).';
comment on column public.scan_rows.guard_name is
	'profiles.name of the guard who scanned.';
comment on column public.scan_rows.checkpoint_name is
	'checkpoints.name at the time of reading (renaming a checkpoint renames it in old rows too).';
comment on column public.scan_rows.report is
	'The scan''s first report as JSON (id, scan_id, note, photos, created_at), or null if none.';
comment on column public.scan_rows.checkpoint_latitude is
	'The checkpoint''s current pin, for drawing the scan against it on the map.';
comment on column public.scan_rows.checkpoint_longitude is
	'The checkpoint''s current pin, for drawing the scan against it on the map.';
comment on column public.scan_rows.checkpoint_radius_m is
	'The checkpoint''s current radius in metres.';
