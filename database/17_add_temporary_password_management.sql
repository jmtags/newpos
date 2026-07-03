-- Add temporary-password creation, forced first-login changes, and admin resets.

alter table public.users
  add column if not exists must_change_password boolean not null default false;

drop function if exists public.admin_create_user(text, text, text, boolean);

create or replace function public.admin_create_user(
  new_full_name text,
  new_email text,
  new_role text,
  new_password text,
  new_is_active boolean default true
)
returns public.users
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  new_auth_user_id uuid;
  created_user public.users;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Only admins can create users.';
  end if;

  if new_role not in (
    'admin',
    'manager',
    'case_staff',
    'associate_user',
    'case_viewer',
    'regular_user'
  ) then
    raise exception 'Invalid user role: %', new_role;
  end if;

  if length(coalesce(new_password, '')) < 8 then
    raise exception 'Temporary password must be at least 8 characters.';
  end if;

  select id
  into new_auth_user_id
  from auth.users
  where lower(email) = lower(new_email);

  if new_auth_user_id is not null then
    raise exception 'A user with this email already exists.';
  end if;

  new_auth_user_id := gen_random_uuid();

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    is_super_admin,
    phone,
    phone_change,
    phone_change_token,
    email_change_token_current
  )
  values (
    new_auth_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(new_email),
    extensions.crypt(new_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', new_full_name),
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    null,
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    new_auth_user_id::text,
    new_auth_user_id,
    jsonb_build_object('sub', new_auth_user_id::text, 'email', lower(new_email)),
    'email',
    now(),
    now(),
    now()
  );

  insert into public.users (
    auth_user_id,
    full_name,
    email,
    role,
    is_active,
    must_change_password
  )
  values (
    new_auth_user_id,
    new_full_name,
    lower(new_email),
    new_role,
    new_is_active,
    true
  )
  returning * into created_user;

  return created_user;
end;
$$;

create or replace function public.admin_set_user_password(
  target_user_id uuid,
  new_password text
)
returns public.users
language plpgsql
security definer
set search_path = public, auth
set row_security = off
as $$
declare
  target_user public.users;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'Only admins can change another user''s password.';
  end if;

  if length(coalesce(new_password, '')) < 8 then
    raise exception 'Temporary password must be at least 8 characters.';
  end if;

  select *
  into target_user
  from public.users
  where id = target_user_id;

  if target_user.id is null or target_user.auth_user_id is null then
    raise exception 'User account was not found.';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  where id = target_user.auth_user_id;

  if not found then
    raise exception 'Authentication account was not found.';
  end if;

  update public.users
  set
    must_change_password = true,
    updated_at = now()
  where id = target_user_id
  returning * into target_user;

  return target_user;
end;
$$;

create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.users
  set
    must_change_password = false,
    updated_at = now()
  where auth_user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.admin_create_user(text, text, text, text, boolean) from public;
revoke all on function public.admin_set_user_password(uuid, text) from public;
revoke all on function public.complete_password_change() from public;
grant execute on function public.admin_create_user(text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
grant execute on function public.complete_password_change() to authenticated;

-- Profile updates must stay admin-only. Password-change completion uses the
-- narrowly scoped security-definer function above.
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_update_admin_only on public.users;
create policy users_update_admin_only
on public.users
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
