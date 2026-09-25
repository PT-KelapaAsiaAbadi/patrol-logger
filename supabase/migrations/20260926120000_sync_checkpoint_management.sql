-- Brings a database created from the FIRST version of 20260923120000_patrol_schema.sql up to date.
--
-- That file was edited after it had already been applied to the hosted project (it gained
-- qr_version and the checkpoint and account management functions). Migrations only run once,
-- so the hosted project never got those edits, and the location migration's submit_scan, which
-- reads qr_version, failed on every QR scan. Everything below is safe to run on a database that
-- already has all of it (the local stack, a fresh project).

-- ---------- QR versions ----------

alter table public.checkpoints add column if not exists qr_version integer not null default 1;

-- Stickers printed before qr_version existed were signed over the id alone. Version 1 keeps that
-- signature so they stay valid; a replaced sticker (version 2 and up) signs "<id>:<version>".
create or replace function private.qr_signature(p_checkpoint_id uuid, p_version integer) returns text
language sql stable security definer set search_path = ''
as $$
	select left(
		translate(
			encode(
				extensions.hmac(
					case
						when p_version = 1 then p_checkpoint_id::text
						else p_checkpoint_id::text || ':' || p_version::text
					end,
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
revoke all on function private.qr_signature(uuid, integer) from public, anon, authenticated;
drop function if exists private.qr_signature(uuid);

/** What gets encoded into a checkpoint's QR sticker: PTRL1:<id>:<signature> */
create or replace function public.qr_payload(p_checkpoint_id uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
	v_version integer;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	select qr_version into v_version from public.checkpoints where id = p_checkpoint_id;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	return 'PTRL1:' || p_checkpoint_id::text || ':' || private.qr_signature(p_checkpoint_id, v_version);
end;
$$;

-- ---------- checkpoint management ----------

/** Renames a checkpoint and/or takes it in or out of use. Null leaves that field as it is. */
create or replace function public.update_checkpoint(p_id uuid, p_name text, p_active boolean)
returns public.checkpoints
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_row public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	update public.checkpoints
	set name = coalesce(regexp_replace(trim(p_name), '\s+', ' ', 'g'), name),
		active = coalesce(p_active, active)
	where id = p_id
	returning * into v_row;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	return v_row;
end;
$$;

/** Swaps a checkpoint with its neighbour in the route: p_up moves it one stop earlier. */
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
	select * into v_me from public.checkpoints where id = p_id;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	if p_up then
		select * into v_other from public.checkpoints
		where route_order < v_me.route_order order by route_order desc limit 1;
	else
		select * into v_other from public.checkpoints
		where route_order > v_me.route_order order by route_order limit 1;
	end if;
	if not found then
		return; -- already first or last
	end if;
	update public.checkpoints set route_order = v_other.route_order where id = v_me.id;
	update public.checkpoints set route_order = v_me.route_order where id = v_other.id;
end;
$$;

/**
 * For a lost, damaged or copied sticker: new QR signature and new typed code.
 * Every printed copy of the old sticker stops working at once, so print the new one straight away.
 */
create or replace function public.reissue_checkpoint(p_id uuid) returns public.checkpoints
language plpgsql volatile security definer set search_path = ''
as $$
declare
	v_row public.checkpoints;
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	update public.checkpoints
	set qr_version = qr_version + 1,
		manual_code = private.new_manual_code()
	where id = p_id
	returning * into v_row;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
	return v_row;
end;
$$;

-- ---------- accounts ----------

/**
 * Takes an account out of use, or back into it. An inactive account can't sign in, and Row Level
 * Security gives any session it still has nothing. Supervisors can't deactivate themselves.
 */
create or replace function public.set_account_active(p_id uuid, p_active boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
	if not private.is_supervisor() then
		raise exception 'not_allowed' using errcode = '42501';
	end if;
	if p_id = auth.uid() then
		raise exception 'cannot_change_self' using errcode = '42501';
	end if;
	update public.profiles set active = p_active where id = p_id;
	if not found then
		raise exception 'not_found' using errcode = 'P0002';
	end if;
end;
$$;

-- ---------- function access ----------

revoke execute on function
	public.qr_payload(uuid),
	public.update_checkpoint(uuid, text, boolean),
	public.move_checkpoint(uuid, boolean),
	public.reissue_checkpoint(uuid),
	public.set_account_active(uuid, boolean)
from public, anon;

grant execute on function
	public.qr_payload(uuid),
	public.update_checkpoint(uuid, text, boolean),
	public.move_checkpoint(uuid, boolean),
	public.reissue_checkpoint(uuid),
	public.set_account_active(uuid, boolean)
to authenticated;
