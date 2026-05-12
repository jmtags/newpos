create extension if not exists pgcrypto with schema extensions;

alter table public.users enable row level security;

drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_admin_only on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create or replace function public.is_admin_user(auth_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users
    where auth_user_id = auth_id
      and role = 'admin'
      and is_active = true
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated;

create or replace function public.admin_create_user(
  new_full_name text,
  new_email text,
  new_role text,
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

  if new_role not in ('admin', 'manager', 'regular_user') then
    raise exception 'Invalid user role: %', new_role;
  end if;

  select id
  into new_auth_user_id
  from auth.users
  where lower(email) = lower(new_email);

  if new_auth_user_id is null then
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
      extensions.crypt(
        gen_random_uuid()::text || random()::text,
        extensions.gen_salt('bf')
      ),
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
  end if;

  insert into public.users (
    auth_user_id,
    full_name,
    email,
    role,
    is_active
  )
  values (
    new_auth_user_id,
    new_full_name,
    lower(new_email),
    new_role,
    new_is_active
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now()
  returning * into created_user;

  return created_user;
end;
$$;

revoke all on function public.admin_create_user(text, text, text, boolean) from public;
grant execute on function public.admin_create_user(text, text, text, boolean) to authenticated;

create policy users_select_own_or_admin
on public.users
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
);

create policy users_insert_admin_only
on public.users
for insert
to authenticated
with check (
  public.is_admin_user(auth.uid())
);

create policy users_update_own_or_admin
on public.users
for update
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
)
with check (
  auth_user_id = auth.uid()
  or public.is_admin_user(auth.uid())
);

create policy users_delete_admin_only
on public.users
for delete
to authenticated
using (
  public.is_admin_user(auth.uid())
);

do $$
declare
  admin_auth_user_id uuid;
  admin_email text := 'admin@psyzygyclinic.com';
  admin_password text := 'Admin@123456';
begin
  select id
  into admin_auth_user_id
  from auth.users
  where email = admin_email;

  if admin_auth_user_id is null then
    admin_auth_user_id := gen_random_uuid();

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
      admin_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      admin_email,
      extensions.crypt(admin_password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin User"}'::jsonb,
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
      admin_auth_user_id::text,
      admin_auth_user_id,
      jsonb_build_object('sub', admin_auth_user_id::text, 'email', admin_email),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  insert into public.users (
    auth_user_id,
    full_name,
    email,
    role,
    is_active
  )
  values (
    admin_auth_user_id,
    'Admin User',
    admin_email,
    'admin',
    true
  )
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();
end $$;

insert into public.users (
  auth_user_id,
  full_name,
  email,
  role,
  is_active
)
select
  auth_user.id,
  'Admin User',
  auth_user.email,
  'admin',
  true
from auth.users auth_user
where auth_user.email = 'admin@psyzygyclinic.com'
on conflict (email) do update
set
  auth_user_id = excluded.auth_user_id,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = now();
