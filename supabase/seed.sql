-- LOCAL DEVELOPMENT ONLY. `supabase db reset` runs this; `supabase db push` never sends it
-- to the hosted project. On the hosted project, create the first supervisor as described in README.md.
--
-- Accounts (password for both: patroli-local-1). Type the number any common way, e.g. 0811-0000-0001.
--   +62 811-0000-0001  Rina Wijaya   (supervisor)
--   +62 811-0000-0002  Budi Santoso  (guard)

do $$
declare
	v_supervisor uuid := '00000000-0000-4000-8000-000000000001';
	v_guard uuid := '00000000-0000-4000-8000-000000000002';
	v_user record;
begin
	for v_user in
		select * from (values
			(v_supervisor, '6281100000001', 'Rina Wijaya', 'supervisor'::public.app_role),
			(v_guard, '6281100000002', 'Budi Santoso', 'guard'::public.app_role)
		) as t (id, phone, name, role)
	loop
		insert into auth.users (
			instance_id, id, aud, role, phone, encrypted_password, phone_confirmed_at,
			raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
			confirmation_token, recovery_token, email_change, email_change_token_new
		) values (
			'00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
			v_user.phone, extensions.crypt('patroli-local-1', extensions.gen_salt('bf')), now(),
			'{"provider":"phone","providers":["phone"]}', jsonb_build_object('name', v_user.name),
			now(), now(), '', '', '', ''
		);
		insert into auth.identities (
			id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
		) values (
			gen_random_uuid(), v_user.id, v_user.id::text,
			jsonb_build_object('sub', v_user.id::text, 'phone', v_user.phone, 'phone_verified', true),
			'phone', now(), now(), now()
		);
		insert into public.profiles (id, name, phone, role)
		values (v_user.id, v_user.name, v_user.phone, v_user.role);
	end loop;

	-- Every checkpoint needs a location. These are a few tens of metres apart around -6.21, 106.81,
	-- the position the browser test gives the guard's phone, so its scans land "at checkpoint".
	insert into public.checkpoints (name, route_order, manual_code, latitude, longitude)
	select name, ord, private.new_manual_code(), lat, lng
	from unnest(
		array[
			'Lobi utama',
			'Pintu samping timur',
			'Parkir basement B1',
			'Ruang panel listrik',
			'Tangga darurat lantai 2',
			'Gudang belakang',
			'Atap dan tandon air',
			'Pos jaga gerbang'
		],
		array[-6.21000, -6.21020, -6.21015, -6.20985, -6.20995, -6.21045, -6.20970, -6.21060],
		array[106.81000, 106.81030, 106.80990, 106.81015, 106.80975, 106.81005, 106.80995, 106.81050]
	) with ordinality as t (name, lat, lng, ord);
end;
$$;
