-- LOCAL DEVELOPMENT ONLY. `supabase db reset` runs this; `supabase db push` never sends it
-- to the hosted project. On the hosted project, create the first supervisor as described in README.md.
--
-- Accounts (password for both: patroli-local-1):
--   supervisor@patroli.test  (supervisor)
--   guard@patroli.test       (guard)

do $$
declare
	v_supervisor uuid := '00000000-0000-4000-8000-000000000001';
	v_guard uuid := '00000000-0000-4000-8000-000000000002';
	v_user record;
begin
	for v_user in
		select * from (values
			(v_supervisor, 'supervisor@patroli.test', 'Rina Wijaya', 'supervisor'::public.app_role),
			(v_guard, 'guard@patroli.test', 'Budi Santoso', 'guard'::public.app_role)
		) as t (id, email, name, role)
	loop
		insert into auth.users (
			instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
			raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
			confirmation_token, recovery_token, email_change, email_change_token_new
		) values (
			'00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
			v_user.email, extensions.crypt('patroli-local-1', extensions.gen_salt('bf')), now(),
			'{"provider":"email","providers":["email"]}', jsonb_build_object('name', v_user.name),
			now(), now(), '', '', '', ''
		);
		insert into auth.identities (
			id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
		) values (
			gen_random_uuid(), v_user.id, v_user.id::text,
			jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
			'email', now(), now(), now()
		);
		insert into public.profiles (id, name, email, role)
		values (v_user.id, v_user.name, v_user.email, v_user.role);
	end loop;

	insert into public.checkpoints (name, route_order, manual_code)
	select name, ord, private.new_manual_code()
	from unnest(array[
		'Lobi utama',
		'Pintu samping timur',
		'Parkir basement B1',
		'Ruang panel listrik',
		'Tangga darurat lantai 2',
		'Gudang belakang',
		'Atap dan tandon air',
		'Pos jaga gerbang'
	]) with ordinality as t (name, ord);
end;
$$;
