-- Phone sign-in. Staff sign in with their phone number and password instead of an email address.
-- Accounts are still only made by a supervisor (the create-guards Edge Function); public sign-up
-- stays off.
--
-- profiles.phone holds the number the way Supabase Auth stores it in auth.users.phone: digits
-- only, country code first, no "+" (6281234567890). Both are written together by the Edge
-- Functions, which hold the service-role key.
--
-- profiles.phone_verified_at is set when the staff member proved the number is theirs with a
-- one-time code (the staff-phone Edge Function). Null means a supervisor typed it in and it hasn't
-- been confirmed.
--
-- profiles.email is kept for accounts made before this change. Those accounts need a phone number
-- before they can sign in again (see README.md); the column can be dropped once every account has one.

alter table public.profiles alter column email drop not null;

alter table public.profiles
	add column phone text unique check (phone ~ '^[1-9][0-9]{7,14}$'),
	add column phone_verified_at timestamptz;

-- Copy any number an account already has in Auth (normally none, unless added by hand).
update public.profiles p
set phone = u.phone
from auth.users u
where u.id = p.id and u.phone ~ '^[1-9][0-9]{7,14}$';

-- Every account can be told apart by at least one of the two.
alter table public.profiles
	add constraint profiles_phone_or_email check (phone is not null or email is not null);
