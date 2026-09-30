-- Stop numbers stay 1, 2, 3... with no gaps.
--
-- A removed checkpoint used to keep its route_order, so the round showed gaps (7 checkpoints
-- numbered up to 9) and a new checkpoint was numbered after the removed ones. Now removing
-- checkpoints renumbers the rest in the same order, and a new checkpoint takes the number after
-- the last one still in the round. Removed checkpoints keep their old number: nothing orders or
-- shows them, and old scans don't use it.

/** Renumbers the checkpoints still in the round 1..n, keeping their order. */
create function private.renumber_round() returns void
language sql volatile set search_path = ''
as $$
	with ordered as (
		select id, row_number() over (order by route_order, created_at) as n
		from public.checkpoints
		where removed_at is null
	)
	update public.checkpoints c
	set route_order = o.n
	from ordered o
	where c.id = o.id and c.route_order <> o.n;
$$;

revoke all on function private.renumber_round() from public, anon, authenticated;

/** Removes checkpoints, then closes the gaps they leave in the numbering. Returns how many. */
create or replace function public.remove_checkpoints(p_ids uuid[]) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_count integer;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	-- Same lock as create_checkpoint and move_checkpoint, so numbering never interleaves.
	lock table public.checkpoints in share row exclusive mode;
	update public.checkpoints
	set removed_at = now(), active = false
	where id = any(p_ids) and removed_at is null;
	get diagnostics v_count = row_count;
	if v_count > 0 then
		perform private.renumber_round();
	end if;
	return v_count;
end;
$$;

/** Adds a checkpoint at the end of the round, with its map location. */
create or replace function public.create_checkpoint(
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
		-- After the last checkpoint still in the round, not after removed ones.
		coalesce((select max(route_order) from public.checkpoints where removed_at is null), 0) + 1,
		private.new_manual_code(),
		p_lat,
		p_lng,
		coalesce(p_radius_m, 50)
	)
	returning * into v_row;
	return v_row;
end;
$$;

-- Close the gaps left by checkpoints removed before this change.
select private.renumber_round();
