-- Location checks.
--
-- Supervisors pin each checkpoint on a map and give it a radius. The guard's phone sends its GPS
-- position with each scan, and the server records how far that was from the checkpoint.
--
-- A scan that's too far away is still stored, just marked 'far'. GPS is weak or missing indoors
-- (basements, stairwells), which is exactly where guards patrol, so rejecting scans would lock out
-- honest guards. The supervisor sees the flag instead.
--
-- location_status:
--   ok       within the radius (allowing for the phone's stated accuracy, up to 100 m)
--   far      further than that
--   no_fix   the phone had no usable position (permission off, no GPS, or an older app version)
--   not_set  the checkpoint has no location yet

-- ---------- columns ----------

alter table public.checkpoints
	add column latitude double precision check (latitude between -90 and 90),
	add column longitude double precision check (longitude between -180 and 180),
	add column radius_m integer not null default 50 check (radius_m between 10 and 1000),
	add constraint checkpoints_location_complete check ((latitude is null) = (longitude is null));

alter table public.scans
	add column latitude double precision,
	add column longitude double precision,
	add column accuracy_m real,
	add column distance_m integer, -- snapshot at scan time, so moving a checkpoint later doesn't rewrite history
	add column location_status text not null default 'no_fix'
		check (location_status in ('ok', 'far', 'no_fix', 'not_set'));

-- ---------- distance ----------

/** Great-circle distance in metres (haversine). Plenty accurate over a few hundred metres. */
create function private.distance_m(
	p_lat1 double precision, p_lng1 double precision,
	p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql immutable set search_path = ''
as $$
	select 2 * 6371000 * asin(sqrt(
		power(sin(radians(p_lat2 - p_lat1) / 2), 2)
		+ cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
	))
$$;
revoke all on function private.distance_m(double precision, double precision, double precision, double precision)
	from public, anon, authenticated;

-- ---------- checkpoint location ----------

/** Pins a checkpoint on the map, or clears its location when p_lat and p_lng are null. */
create function public.set_checkpoint_location(
	p_id uuid, p_lat double precision, p_lng double precision, p_radius_m integer
) returns public.checkpoints
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_row public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	update public.checkpoints
	set latitude = p_lat,
		longitude = p_lng,
		radius_m = coalesce(p_radius_m, radius_m)
	where id = p_id
	returning * into v_row;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	return v_row;
end;
$$;

-- ---------- scanning, now with the phone's position ----------

drop function public.submit_scan(uuid, text, timestamptz);

/**
 * Records a scan from a signed QR payload or a printed manual code.
 * Idempotent: the same scan id twice returns the first result. The guard is always the caller,
 * whatever the phone claims. The position parameters are optional so scans queued by an older
 * version of the app still go through (as no_fix).
 */
create function public.submit_scan(
	p_id uuid,
	p_code text,
	p_scanned_at timestamptz,
	p_lat double precision default null,
	p_lng double precision default null,
	p_accuracy_m real default null
) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_code text := trim(coalesce(p_code, ''));
	v_parts text[];
	v_cp public.checkpoints;
	v_scan public.scans;
	v_has_fix boolean;
	v_distance double precision;
	v_status text;
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
		select * into v_cp from public.checkpoints where id = v_parts[2]::uuid;
		-- Unknown id, forged, or an old sticker that was reissued.
		if not found or private.qr_signature(v_cp.id, v_cp.qr_version) <> v_parts[3] then
			return jsonb_build_object('ok', false, 'reason', 'unknown_code');
		end if;
	else
		select * into v_cp from public.checkpoints
		where replace(manual_code, '-', '') = upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'));
		if not found then
			return jsonb_build_object('ok', false, 'reason', 'unknown_code');
		end if;
	end if;
	if not v_cp.active then
		return jsonb_build_object('ok', false, 'reason', 'inactive');
	end if;

	-- A usable position: both coordinates in range, and an accuracy the phone vouches for.
	v_has_fix := p_lat between -90 and 90 and p_lng between -180 and 180
		and p_accuracy_m >= 0 and p_accuracy_m < 100000;
	v_has_fix := coalesce(v_has_fix, false);
	if not v_has_fix then
		v_status := 'no_fix';
	elsif v_cp.latitude is null then
		v_status := 'not_set';
	else
		v_distance := private.distance_m(p_lat, p_lng, v_cp.latitude, v_cp.longitude);
		-- Give the benefit of the doubt for the phone's stated accuracy, but no more than 100 m.
		v_status := case when v_distance <= v_cp.radius_m + least(p_accuracy_m, 100) then 'ok' else 'far' end;
	end if;

	insert into public.scans (
		id, checkpoint_id, guard_id, scanned_at,
		latitude, longitude, accuracy_m, distance_m, location_status
	)
	values (
		p_id, v_cp.id, v_uid, p_scanned_at,
		case when v_has_fix then p_lat end,
		case when v_has_fix then p_lng end,
		case when v_has_fix then p_accuracy_m end,
		round(v_distance)::integer,
		v_status
	)
	on conflict (id) do nothing
	returning * into v_scan;
	if v_scan.id is null then -- lost a race with a retry of the same scan
		select * into v_scan from public.scans where id = p_id;
	end if;
	return private.scan_result(v_scan);
end;
$$;

-- ---------- supervisor log ----------

-- New columns go at the end: create or replace view can only append.
create or replace view public.scan_rows with (security_invoker = on) as
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
	) as report,
	s.latitude,
	s.longitude,
	s.accuracy_m,
	s.distance_m,
	s.location_status,
	c.latitude as checkpoint_latitude,
	c.longitude as checkpoint_longitude,
	c.radius_m as checkpoint_radius_m
from public.scans s
join public.profiles p on p.id = s.guard_id
join public.checkpoints c on c.id = s.checkpoint_id;

-- ---------- function access ----------

revoke execute on function
	public.set_checkpoint_location(uuid, double precision, double precision, integer),
	public.submit_scan(uuid, text, timestamptz, double precision, double precision, real)
from public, anon;

grant execute on function
	public.set_checkpoint_location(uuid, double precision, double precision, integer),
	public.submit_scan(uuid, text, timestamptz, double precision, double precision, real)
to authenticated;
