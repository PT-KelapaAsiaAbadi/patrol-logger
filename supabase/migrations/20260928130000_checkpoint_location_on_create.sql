-- A new checkpoint is created together with its map location, in one step.
--
-- Before, the app called create_checkpoint(name) and then set_checkpoint_location(); if the second
-- call failed, a checkpoint without a location was left behind. The app now requires a location
-- when adding a checkpoint and sends it here.
--
-- The location parameters default to null so the app version currently deployed (which sends only
-- the name) keeps working until the new one replaces it.
-- TODO: once the new app is deployed everywhere, make p_lat and p_lng required here (drop the
-- defaults) so the database enforces "every new checkpoint has a location" too.

drop function if exists public.create_checkpoint(text);

/** Adds a checkpoint at the end of the route, with its map location when given. */
create function public.create_checkpoint(
	p_name text,
	p_lat double precision default null,
	p_lng double precision default null,
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
	-- Both halves of a position, or neither (the table's own check would say the same, less clearly).
	if (p_lat is null) <> (p_lng is null) then
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
