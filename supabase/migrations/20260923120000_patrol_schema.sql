-- Patroli schema.
--
-- Security model:
--   * Every signed-in person has a row in `profiles` with a role. Profiles are only created
--     by the create-guards Edge Function (service role), so a self-made auth account has no access.
--   * Row Level Security decides what each role can read. Nothing is written straight into a
--     table by the app: every write goes through a SECURITY DEFINER function below that checks
--     the caller first.
--   * The QR signing key lives in Vault and never leaves the database.

-- ---------- helpers (not exposed through the API) ----------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('guard', 'supervisor');

-- ---------- tables ----------

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	name text not null check (length(trim(name)) between 1 and 120),
	email text not null unique,
	role public.app_role not null default 'guard',
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table public.checkpoints (
	id uuid primary key default gen_random_uuid(),
	name text not null check (length(trim(name)) between 1 and 80),
	route_order integer not null,
	-- Printed under the QR for when the camera fails. Same alphabet as the stickers: no 0/O or 1/I.
	manual_code text not null unique check (manual_code ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$'),
	active boolean not null default true,
	created_at timestamptz not null default now()
);

create table public.scans (
	id uuid primary key, -- made on the phone, so a retried upload can't create a duplicate
	checkpoint_id uuid not null references public.checkpoints (id),
	guard_id uuid not null references public.profiles (id),
	scanned_at timestamptz not null, -- phone clock
	received_at timestamptz not null default now() -- server clock
);
create index scans_scanned_at_idx on public.scans (scanned_at desc);
create index scans_guard_idx on public.scans (guard_id, scanned_at desc);
create index scans_checkpoint_idx on public.scans (checkpoint_id, scanned_at desc);

create table public.reports (
	id uuid primary key, -- made on the phone, like scans
	scan_id uuid not null references public.scans (id) on delete cascade,
	note text not null default '' check (length(note) <= 4000),
	photos text[] not null default '{}', -- object paths in the report-photos bucket
	created_at timestamptz not null
);
create index reports_scan_idx on public.reports (scan_id);

-- ---------- who is calling ----------

create function private.my_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$
	select role from public.profiles where id = auth.uid() and active
$$;

create function private.is_supervisor() returns boolean
language sql stable security definer set search_path = ''
as $$
	select coalesce(private.my_role() = 'supervisor', false)
$$;

create function private.is_guard() returns boolean
language sql stable security definer set search_path = ''
as $$
	select coalesce(private.my_role() = 'guard', false)
$$;

grant usage on schema private to authenticated;
grant execute on function private.my_role(), private.is_supervisor(), private.is_guard() to authenticated;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.checkpoints enable row level security;
alter table public.scans enable row level security;
alter table public.reports enable row level security;

-- The app never talks to the database signed out.
revoke all on public.profiles, public.checkpoints, public.scans, public.reports from anon;
-- Writes only go through the functions below.
revoke insert, update, delete, truncate on public.profiles, public.checkpoints, public.scans, public.reports from authenticated;

create policy "own profile, or any profile for supervisors" on public.profiles
	for select to authenticated
	using (id = (select auth.uid()) or (select private.is_supervisor()));

-- Guards read the route through route_checkpoints(), which leaves out the manual codes.
create policy "supervisors read checkpoints" on public.checkpoints
	for select to authenticated
	using ((select private.is_supervisor()));

create policy "own scans, or all scans for supervisors" on public.scans
	for select to authenticated
	using (guard_id = (select auth.uid()) or (select private.is_supervisor()));

create policy "reports on own scans, or all for supervisors" on public.reports
	for select to authenticated
	using (
		(select private.is_supervisor())
		or exists (select 1 from public.scans s where s.id = scan_id and s.guard_id = (select auth.uid()))
	);

-- ---------- supervisor log ----------

-- security_invoker: the policies above still apply to whoever queries the view.
create view public.scan_rows with (security_invoker = on) as
select
	s.id,
	s.checkpoint_id,
	s.guard_id,
	s.scanned_at,
	s.received_at,
	p.name as guard_name,
	c.name as checkpoint_name,
	(
		select jsonb_build_object(
			'id', r.id, 'scan_id', r.scan_id, 'note', r.note,
			'photos', to_jsonb(r.photos), 'created_at', r.created_at
		)
		from public.reports r
		where r.scan_id = s.id
		order by r.created_at
		limit 1
	) as report
from public.scans s
join public.profiles p on p.id = s.guard_id
join public.checkpoints c on c.id = s.checkpoint_id;

revoke all on public.scan_rows from anon;

-- ---------- QR signing ----------

select vault.create_secret(
	encode(extensions.gen_random_bytes(32), 'hex'),
	'qr_signing_key',
	'HMAC key for checkpoint QR stickers'
);

-- base64url of HMAC-SHA256(id), first 16 characters (96 bits) is plenty for a sticker.
create function private.qr_signature(p_checkpoint_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
	select left(
		translate(
			encode(
				extensions.hmac(
					p_checkpoint_id::text,
					(select decrypted_secret from vault.decrypted_secrets where name = 'qr_signing_key'),
					'sha256'
				),
				'base64'
			),
			'+/', '-_'
		),
		16
	)
$$;
revoke all on function private.qr_signature(uuid) from public, anon, authenticated;

/** What gets encoded into a checkpoint's QR sticker: PTRL1:<id>:<signature> */
create function public.qr_payload(p_checkpoint_id uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	return 'PTRL1:' || p_checkpoint_id::text || ':' || private.qr_signature(p_checkpoint_id);
end;
$$;

-- ---------- checkpoints ----------

create function private.new_manual_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
	alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 letters, so byte % 32 is uniform
	bytes bytea;
	code text;
begin
	loop
		bytes := extensions.gen_random_bytes(6);
		code := '';
		for i in 0..5 loop
			if i = 3 then code := code || '-'; end if;
			code := code || substr(alphabet, 1 + get_byte(bytes, i) % 32, 1);
		end loop;
		exit when not exists (select 1 from public.checkpoints where manual_code = code);
	end loop;
	return code;
end;
$$;
revoke all on function private.new_manual_code() from public, anon, authenticated;

/** Adds a checkpoint at the end of the route. */
create function public.create_checkpoint(p_name text) returns public.checkpoints
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_row public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	-- Serialise route_order assignment when two supervisors add at once.
	lock table public.checkpoints in share row exclusive mode;
	insert into public.checkpoints (name, route_order, manual_code)
	values (
		regexp_replace(trim(p_name), '\s+', ' ', 'g'),
		coalesce((select max(route_order) from public.checkpoints), 0) + 1,
		private.new_manual_code()
	)
	returning * into v_row;
	return v_row;
end;
$$;

/** The route as a guard's phone may cache it: active checkpoints, no manual codes. */
create function public.route_checkpoints()
returns table (id uuid, name text, route_order integer, active boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
	if private.my_role() is null then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	return query
		select c.id, c.name, c.route_order, c.active
		from public.checkpoints c
		where c.active
		order by c.route_order;
end;
$$;

-- ---------- scanning ----------

create function private.scan_result(p_scan public.scans) returns jsonb
language sql stable security definer set search_path = ''
as $$
	select jsonb_build_object(
		'ok', true,
		'scan', to_jsonb(p_scan),
		'checkpoint', (
			select jsonb_build_object('id', c.id, 'name', c.name, 'route_order', c.route_order, 'active', c.active)
			from public.checkpoints c where c.id = p_scan.checkpoint_id
		)
	)
$$;
revoke all on function private.scan_result(public.scans) from public, anon, authenticated;

/**
 * Records a scan from a signed QR payload or a printed manual code.
 * Idempotent: the same scan id twice returns the first result. The guard is always the caller,
 * whatever the phone claims.
 */
create function public.submit_scan(p_id uuid, p_code text, p_scanned_at timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_code text := trim(coalesce(p_code, ''));
	v_parts text[];
	v_cp public.checkpoints;
	v_scan public.scans;
begin
	if not private.is_guard() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;

	select * into v_scan from public.scans where id = p_id;
	if found then
		if v_scan.guard_id <> v_uid then
			raise exception 'not_allowed' using errcode = '42501';
		end if;
		return private.scan_result(v_scan);
	end if;

	v_parts := string_to_array(v_code, ':');
	if array_length(v_parts, 1) = 3 and v_parts[1] = 'PTRL1' then
		-- Two separate checks: SQL doesn't promise to short-circuit OR, and a bad id must not reach ::uuid.
		if v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
			return jsonb_build_object('ok', false, 'reason', 'unknown_code'); -- damaged
		end if;
		if private.qr_signature(v_parts[2]::uuid) <> v_parts[3] then
			return jsonb_build_object('ok', false, 'reason', 'unknown_code'); -- forged
		end if;
		select * into v_cp from public.checkpoints where id = v_parts[2]::uuid;
	else
		select * into v_cp from public.checkpoints
		where replace(manual_code, '-', '') = upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'));
	end if;

	if not found then
		return jsonb_build_object('ok', false, 'reason', 'unknown_code');
	end if;
	if not v_cp.active then
		return jsonb_build_object('ok', false, 'reason', 'inactive');
	end if;

	insert into public.scans (id, checkpoint_id, guard_id, scanned_at)
	values (p_id, v_cp.id, v_uid, p_scanned_at)
	on conflict (id) do nothing
	returning * into v_scan;
	if v_scan.id is null then -- lost a race with a retry of the same scan
		select * into v_scan from public.scans where id = p_id;
	end if;
	return private.scan_result(v_scan);
end;
$$;

/**
 * Stores a report on one of the caller's scans. Idempotent on report id.
 * Photos must already be uploaded under <caller id>/<report id>/ in the report-photos bucket.
 */
create function public.submit_report(
	p_id uuid, p_scan_id uuid, p_note text, p_photos text[], p_created_at timestamptz
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_owner uuid;
	v_prefix text := auth.uid()::text || '/' || p_id::text || '/';
begin
	if not private.is_guard() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;

	select guard_id into v_owner from public.scans where id = p_scan_id;
	if not found then
		raise exception 'scan_not_synced' using errcode = 'P0002';
	end if;
	if v_owner <> v_uid then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	if cardinality(coalesce(p_photos, '{}')) > 5
		or exists (select 1 from unnest(coalesce(p_photos, '{}')) path where left(path, length(v_prefix)) <> v_prefix) then
		raise exception 'bad_photos' using errcode = '22023';
	end if;

	insert into public.reports (id, scan_id, note, photos, created_at)
	values (p_id, p_scan_id, coalesce(trim(p_note), ''), coalesce(p_photos, '{}'), p_created_at)
	on conflict (id) do nothing;
end;
$$;

-- ---------- supervisor summaries ----------

/** Each active guard's scans between p_from and p_to (the supervisor's "today"). */
create function public.guard_summaries(p_from timestamptz, p_to timestamptz)
returns table (guard_id uuid, guard_name text, scans_today integer, last_scan_at timestamptz)
language plpgsql stable security invoker set search_path = ''
as $$
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	return query
		select p.id, p.name, count(s.id)::integer, max(s.scanned_at)
		from public.profiles p
		left join public.scans s
			on s.guard_id = p.id and s.scanned_at >= p_from and s.scanned_at < p_to
		where p.role = 'guard' and p.active
		group by p.id, p.name
		order by p.name;
end;
$$;

/** Active checkpoints nobody scanned between p_from and p_to, in route order. */
create function public.missed_checkpoints(p_from timestamptz, p_to timestamptz)
returns setof public.checkpoints
language plpgsql stable security invoker set search_path = ''
as $$
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	return query
		select c.*
		from public.checkpoints c
		where c.active
			and not exists (
				select 1 from public.scans s
				where s.checkpoint_id = c.id and s.scanned_at >= p_from and s.scanned_at < p_to
			)
		order by c.route_order;
end;
$$;

-- ---------- function access ----------
-- Postgres lets everyone execute new functions by default. Only signed-in users may call these.

revoke execute on function
	public.qr_payload(uuid),
	public.create_checkpoint(text),
	public.route_checkpoints(),
	public.submit_scan(uuid, text, timestamptz),
	public.submit_report(uuid, uuid, text, text[], timestamptz),
	public.guard_summaries(timestamptz, timestamptz),
	public.missed_checkpoints(timestamptz, timestamptz)
from public, anon;

grant execute on function
	public.qr_payload(uuid),
	public.create_checkpoint(text),
	public.route_checkpoints(),
	public.submit_scan(uuid, text, timestamptz),
	public.submit_report(uuid, uuid, text, text[], timestamptz),
	public.guard_summaries(timestamptz, timestamptz),
	public.missed_checkpoints(timestamptz, timestamptz)
to authenticated;

-- ---------- report photos ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 2 * 1024 * 1024, array['image/jpeg']);

-- Guards upload into their own folder: <user id>/<report id>/<n>.jpg
create policy "guards upload report photos to own folder" on storage.objects
	for insert to authenticated
	with check (
		bucket_id = 'report-photos'
		and (storage.foldername(name))[1] = (select auth.uid())::text
		and (select private.is_guard())
	);

create policy "supervisors and owners read report photos" on storage.objects
	for select to authenticated
	using (
		bucket_id = 'report-photos'
		and ((select private.is_supervisor()) or (storage.foldername(name))[1] = (select auth.uid())::text)
	);
