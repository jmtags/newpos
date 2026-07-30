-- Add an expense-only role for users who manage the Expense Ledger.
-- Run after database/21_add_case_document_attachments.sql.

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (
    role in (
      'admin',
      'manager',
      'case_staff',
      'associate_user',
      'case_viewer',
      'expense_user',
      'regular_user'
    )
  ) not valid;

do $$
begin
  if not exists (
    select 1
    from public.users
    where role not in (
      'admin',
      'manager',
      'case_staff',
      'associate_user',
      'case_viewer',
      'expense_user',
      'regular_user'
    )
  ) then
    alter table public.users
      validate constraint users_role_check;
  else
    raise notice
      'Legacy user roles were preserved. Review unsupported roles in public.users.';
  end if;
end;
$$;

create or replace function public.case_role_values()
returns text[]
language sql
immutable
as $$
  select array[
    'admin',
    'manager',
    'case_staff',
    'associate_user',
    'case_viewer',
    'expense_user',
    'regular_user'
  ]::text[];
$$;

create or replace function public.is_finance_user(auth_id uuid)
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
      and role in ('admin', 'manager', 'expense_user')
      and is_active = true
  );
$$;

revoke all on function public.is_finance_user(uuid) from public;
grant execute on function public.is_finance_user(uuid) to authenticated;

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

  if new_role <> all(public.case_role_values()) then
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

revoke all on function public.admin_create_user(text, text, text, text, boolean) from public;
grant execute on function public.admin_create_user(text, text, text, text, boolean) to authenticated;
