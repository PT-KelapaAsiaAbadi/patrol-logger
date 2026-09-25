-- Removing checkpoints. A removed checkpoint disappears from the round, the Checkpoints tab, the
-- map and the filters, but it isn't deleted: old scans still point at it and still show its name.
-- (Taking a checkpoint out of use is different: it stays listed and can be put back.)

alter table public.checkpoints add column if not exists removed_at timestamptz;

/** Removes checkpoints. Returns how many were removed. */
create or replace function public.remove_checkpoints(p_ids uuid[]) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_count integer;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	update public.checkpoints
	set removed_at = now(), active = false
	where id = any(p_ids) and removed_at is null;
	get diagnostics v_count = row_count;
	return v_count;
end;
$$;

revoke execute on function public.remove_checkpoints(uuid[]) from public, anon;
grant execute on function public.remove_checkpoints(uuid[]) to authenticated;

-- A removed checkpoint is also out of use (active = false), which already keeps it off the
-- guard's route and out of "missed today" and makes a scan of its old sticker say "no longer
-- in use". Checking removed_at as well keeps that true even if someone reactivates it by hand.
create or replace function public.route_checkpoints()
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
		where c.active and c.removed_at is null
		order by c.route_order;
end;
$$;

/** Swaps a checkpoint with its neighbour in the route, skipping removed ones. */
create or replace function public.move_checkpoint(p_id uuid, p_up boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_me public.checkpoints;
	v_other public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	lock table public.checkpoints in share row exclusive mode;
	select * into v_me from public.checkpoints where id = p_id and removed_at is null;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	if p_up then
		select * into v_other from public.checkpoints
		where route_order < v_me.route_order and removed_at is null
		order by route_order desc limit 1;
	else
		select * into v_other from public.checkpoints
		where route_order > v_me.route_order and removed_at is null
		order by route_order limit 1;
	end if;
	if not found then
		return; -- already first or last
	end if;
	update public.checkpoints set route_order = v_other.route_order where id = v_me.id;
	update public.checkpoints set route_order = v_me.route_order where id = v_other.id;
end;
$$;
