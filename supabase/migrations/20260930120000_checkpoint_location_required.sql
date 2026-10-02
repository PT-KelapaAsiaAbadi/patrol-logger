-- Every checkpoint in use has a map location, always.
--
-- Before, a checkpoint could be added without a location (by the app version before
-- 20260928130000) and a location could be removed again later. Now:
--   - checkpoints still without a location are cleaned up (below)
--   - create_checkpoint requires a location
--   - set_checkpoint_location only moves a pin; it can't clear one
--   - the table refuses a checkpoint in use without a location
-- To take a location away, remove the checkpoint itself (remove_checkpoints).
--
-- Run this after the app version that always sends a location is live: older versions add
-- checkpoints by name alone, which this refuses.

-- ---------- clean up checkpoints without a location ----------

-- Never scanned: nothing points at them, so they are deleted.
delete from public.checkpoints c
where c.latitude is null
	and c.removed_at is null
	and not exists (select 1 from public.scans s where s.checkpoint_id = c.id);

-- Scanned: removed the way the Remove button does it, so old scans keep their checkpoint and its
-- name. They leave the round, the Checkpoints tab, the map and the filters.
update public.checkpoints
set removed_at = now(), active = false
where latitude is null and removed_at is null;

-- ---------- the rule ----------

-- Latitude and longitude are already set together (checkpoints_location_complete), so checking
-- latitude is enough. Removed checkpoints are exempt: some were removed for having no location.
alter table public.checkpoints
	add constraint checkpoints_location_required
	check (removed_at is not null or latitude is not null);

comment on column public.checkpoints.latitude is
	'Pinned position (degrees), set on the map by a supervisor; set together with longitude. Required unless the checkpoint is removed (checkpoints_location_required).';
comment on column public.checkpoints.longitude is
	'Pinned position (degrees); set together with latitude. Required unless the checkpoint is removed.';

-- ---------- adding a checkpoint: the location is required ----------

-- The location parameters lose their defaults, which create or replace can't do, so the old
-- function is dropped first.
drop function public.create_checkpoint(text, double precision, double precision, integer);

/** Adds a checkpoint at the end of the route, with its map location. */
create function public.create_checkpoint(
	p_name text,
	p_lat double precision,
	p_lng double precision,
	p_radius_m integer default null
) returns public.checkpoints
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_row public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	if p_lat is null and p_lng is null then
		raise exception 'location_required' using errcode = '22023';
	end if;
	-- Both halves of a position (the table's own check would say the same, less clearly).
	if p_lat is null or p_lng is null then
		raise exception 'location_incomplete' using errcode = '22023';
	end if;
	-- Serialise route_order assignment when two supervisors add at once.
	lock table public.checkpoints in share row exclusive mode;
	insert into public.checkpoints (name, route_order, manual_code, latitude, longitude, radius_m)
	values (
		regexp_replace(trim(p_name), '\s+', ' ', 'g'),
		coalesce((select max(route_order) from public.checkpoints), 0) + 1,
		private.new_manual_code(),
		p_lat,
		p_lng,
		coalesce(p_radius_m, 50)
	)
	returning * into v_row;
	return v_row;
end;
$$;

revoke execute on function public.create_checkpoint(text, double precision, double precision, integer)
	from public, anon;
grant execute on function public.create_checkpoint(text, double precision, double precision, integer)
	to authenticated;

-- ---------- moving a pin: it can't be cleared any more ----------

/** Moves a checkpoint's pin and radius. The location can't be removed, only the checkpoint. */
create or replace function public.set_checkpoint_location(
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
	if p_lat is null and p_lng is null then
		raise exception 'location_required' using errcode = '22023';
	end if;
	if p_lat is null or p_lng is null then
		raise exception 'location_incomplete' using errcode = '22023';
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
