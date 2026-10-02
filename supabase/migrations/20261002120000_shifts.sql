-- Manual scheduling: who works when. A supervisor assigns guards to shifts on the Schedule page;
-- the app never writes the table directly (assign_shift, remove_shift, copy_shifts below).
--
-- A shift is a guard plus a start and an end. The app offers fixed shift times (lib/schedule.ts),
-- but the table stores real timestamps, so other times or longer shifts need no schema change.
-- A night shift crosses midnight and belongs to the day it starts.
--
-- Not here yet (README > Status and TODO > Not decided yet): which checkpoints a shift covers
-- (routes), and using shifts on Today and the guard's home screen.

-- For the no-overlap rule: gist indexes on uuid equality.
create extension if not exists btree_gist with schema extensions;

create table public.shifts (
	id uuid primary key default gen_random_uuid(),
	guard_id uuid not null references public.profiles (id) on delete cascade,
	starts_at timestamptz not null,
	ends_at timestamptz not null,
	created_by uuid references public.profiles (id) on delete set null,
	created_at timestamptz not null default now(),
	constraint shifts_ends_after_start check (ends_at > starts_at),
	constraint shifts_at_most_16_hours check (ends_at - starts_at <= interval '16 hours'),
	-- One guard can't be in two shifts at once. Back to back (one ends as the next starts) is fine.
	constraint shifts_no_overlap exclude using gist (
		guard_id with =,
		tstzrange(starts_at, ends_at) with &&
	)
);
create index shifts_starts_at_idx on public.shifts (starts_at);

comment on table public.shifts is
	'Who works when: one guard, one start and end. Written only through assign_shift, remove_shift and copy_shifts (supervisors).';
comment on column public.shifts.starts_at is
	'Start of the shift. A night shift belongs to the day it starts on.';
comment on column public.shifts.ends_at is
	'End of the shift; after starts_at, at most 16 hours later. A night shift ends the next morning.';
comment on column public.shifts.created_by is
	'The supervisor who assigned it (null if that account was deleted).';

alter table public.shifts enable row level security;
revoke all on public.shifts from anon;
revoke insert, update, delete, truncate on public.shifts from authenticated;

create policy "own shifts, or all shifts for supervisors" on public.shifts
	for select to authenticated
	using (guard_id = (select auth.uid()) or (select private.is_supervisor()));

-- Each shift with its guard's name, for the Schedule page. security_invoker: the policies above
-- (and on profiles) still apply to whoever queries it.
create view public.shift_rows with (security_invoker = on) as
select s.id, s.guard_id, p.name as guard_name, s.starts_at, s.ends_at
from public.shifts s
join public.profiles p on p.id = s.guard_id;

revoke all on public.shift_rows from anon;

/**
 * Puts a guard on a shift. Only for an active guard account; refuses a shift that overlaps one the
 * guard already has (shift_overlap) and the table's own limits (ends after it starts, 16 hours).
 */
create function public.assign_shift(p_guard_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns public.shifts
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_shift public.shifts;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	if not exists (
		select 1 from public.profiles where id = p_guard_id and role = 'guard' and active
	) then
		raise exception 'not_a_guard' using errcode = 'P0002';
	end if;
	begin
		insert into public.shifts (guard_id, starts_at, ends_at, created_by)
		values (p_guard_id, p_starts_at, p_ends_at, auth.uid())
		returning * into v_shift;
	exception when exclusion_violation then
		raise exception 'shift_overlap' using errcode = '23P01';
	end;
	return v_shift;
end;
$$;

/** Takes a guard off a shift. */
create function public.remove_shift(p_id uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	delete from public.shifts where id = p_id;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
end;
$$;

/**
 * "Copy last week": every shift starting in [p_from, p_to), repeated p_days later at the same
 * local time in p_tz (the supervisor's time zone), so a 07:00 shift stays 07:00 even across a
 * daylight-saving change. Skips guards no longer active and shifts that would overlap one already
 * there, so it can be run twice. Returns how many shifts it added.
 */
create function public.copy_shifts(
	p_from timestamptz,
	p_to timestamptz,
	p_days integer default 7,
	p_tz text default 'UTC'
)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_shift public.shifts;
	v_shift_by interval := make_interval(days => p_days);
	v_start timestamptz;
	v_end timestamptz;
	v_added integer := 0;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	if p_to <= p_from or p_to - p_from > interval '31 days' or p_days not between 1 and 31 then
		raise exception 'bad_range' using errcode = '22023';
	end if;
	if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
		raise exception 'bad_time_zone' using errcode = '22023';
	end if;
	for v_shift in
		select s.* from public.shifts s
		join public.profiles p on p.id = s.guard_id and p.role = 'guard' and p.active
		where s.starts_at >= p_from and s.starts_at < p_to
		order by s.starts_at
	loop
		-- Same wall-clock times p_days later in p_tz.
		v_start := ((v_shift.starts_at at time zone p_tz) + v_shift_by) at time zone p_tz;
		v_end := ((v_shift.ends_at at time zone p_tz) + v_shift_by) at time zone p_tz;
		insert into public.shifts (guard_id, starts_at, ends_at, created_by)
		select v_shift.guard_id, v_start, v_end, auth.uid()
		where not exists (
			select 1 from public.shifts o
			where o.guard_id = v_shift.guard_id
				and tstzrange(o.starts_at, o.ends_at) && tstzrange(v_start, v_end)
		);
		if found then
			v_added := v_added + 1;
		end if;
	end loop;
	return v_added;
end;
$$;

revoke execute on function
	public.assign_shift(uuid, timestamptz, timestamptz),
	public.remove_shift(uuid),
	public.copy_shifts(timestamptz, timestamptz, integer, text)
from public, anon;

grant execute on function
	public.assign_shift(uuid, timestamptz, timestamptz),
	public.remove_shift(uuid),
	public.copy_shifts(timestamptz, timestamptz, integer, text)
to authenticated;
