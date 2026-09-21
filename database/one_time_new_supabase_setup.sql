-- One-time Supabase setup for Psyzygy Clinic POS / NEW_POS.
-- Paste the whole file into the Supabase SQL Editor for a fresh project.
--
-- Default admin login created by this script:
--   Email: admin@psyzygyclinic.com
--   Password: Admin@123456
--
-- After running this script, deploy the Edge Function separately:
--   supabase functions deploy ai-clinic-assistant
--
-- The complete Case Management database installer is included at the end of
-- this file. No additional Case Management SQL files are required.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  email text not null unique,
  role text not null default 'regular_user'
    check (role in (
      'admin',
      'manager',
      'case_staff',
      'associate_user',
      'case_viewer',
      'expense_user',
      'regular_user'
    )),
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users
  add column if not exists auth_user_id uuid,
  add column if not exists must_change_password boolean not null default false;

-- Older installations only allowed admin, manager, and regular_user.
-- Replace that legacy constraint before case-specific users are created.
alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in (
    'admin',
    'manager',
    'case_staff',
    'associate_user',
    'case_viewer',
    'expense_user',
    'regular_user'
  )) not valid;

-- Validate immediately when all existing rows already use supported roles.
-- Otherwise, preserve legacy accounts for administrator review while the
-- constraint still protects every new or updated row.
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

-- A legacy users table did not enforce the authentication-account link.
create unique index if not exists users_auth_user_id_idx
  on public.users (auth_user_id);
create index if not exists users_role_idx on public.users (role);
create index if not exists users_is_active_idx on public.users (is_active);

drop trigger if exists trg_users_set_updated_at on public.users;
create trigger trg_users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  full_name text not null,
  birthdate date,
  age integer not null default 0,
  sex text not null default 'Other' check (sex in ('Male', 'Female', 'Other')),
  contact_number text,
  email text,
  address text,
  emergency_contact text,
  notes text,
  consent_status boolean not null default true,
  privacy_acknowledged boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_full_name_idx on public.clients (full_name);
create index if not exists clients_client_code_idx on public.clients (client_code);

create sequence if not exists public.client_code_seq;

do $$
declare
  max_client_number bigint;
begin
  select max(substring(client_code from '^CLT-([0-9]+)$')::bigint)
  into max_client_number
  from public.clients;

  if max_client_number is null then
    perform setval('public.client_code_seq', 1, false);
  else
    perform setval('public.client_code_seq', max_client_number, true);
  end if;
end;
$$;

create or replace function public.assign_client_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate_code text;
begin
  -- Always allocate on the server so older clients cannot submit stale codes.
  loop
    candidate_code :=
      'CLT-' || lpad(nextval('public.client_code_seq')::text, 3, '0');

    exit when not exists (
      select 1
      from public.clients
      where client_code = candidate_code
    );
  end loop;

  new.client_code := candidate_code;

  return new;
end;
$$;

drop trigger if exists trg_clients_assign_client_code on public.clients;
create trigger trg_clients_assign_client_code
before insert on public.clients
for each row execute function public.assign_client_code();

grant usage, select on sequence public.client_code_seq to authenticated;

drop trigger if exists trg_clients_set_updated_at on public.clients;
create trigger trg_clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  description text,
  default_price numeric not null default 0,
  duration_minutes integer not null default 60,
  requires_case_management boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_name_idx on public.services (name);
create index if not exists services_is_active_idx on public.services (is_active);
alter table public.services
  add column if not exists requires_case_management boolean not null default false;
create index if not exists services_requires_case_management_idx
  on public.services (requires_case_management)
  where requires_case_management = true;

drop trigger if exists trg_services_set_updated_at on public.services;
create trigger trg_services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create table if not exists public.mental_health_associates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  profession text,
  contact_number text,
  email text,
  license_number text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mental_health_associates_name_idx
  on public.mental_health_associates (full_name);
create index if not exists mental_health_associates_is_active_idx
  on public.mental_health_associates (is_active);

drop trigger if exists trg_mental_health_associates_set_updated_at
on public.mental_health_associates;
create trigger trg_mental_health_associates_set_updated_at
before update on public.mental_health_associates
for each row execute function public.set_updated_at();

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_name text not null unique,
  referral_type text,
  contact_person text,
  contact_number text,
  email text,
  address text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists referrals_name_idx on public.referrals (referral_name);
create index if not exists referrals_is_active_idx on public.referrals (is_active);

drop trigger if exists trg_referrals_set_updated_at on public.referrals;
create trigger trg_referrals_set_updated_at
before update on public.referrals
for each row execute function public.set_updated_at();

create table if not exists public.clinic_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_name text not null default 'Psyzygy Clinic',
  address text,
  contact_number text,
  email text,
  website text,
  logo_url text,
  show_logo boolean not null default true,
  include_terms boolean not null default true,
  currency text not null default 'PHP',
  privacy_notice text,
  tax_enabled boolean not null default true,
  tax_type text not null default 'NON_VAT'
    check (tax_type in ('VAT', 'NON_VAT', 'NONE')),
  tax_rate numeric not null default 12,
  tax_inclusive boolean not null default true,
  bir_registered boolean not null default false,
  tin_number text,
  receipt_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_clinic_settings_set_updated_at on public.clinic_settings;
create trigger trg_clinic_settings_set_updated_at
before update on public.clinic_settings
for each row execute function public.set_updated_at();

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payment_methods_set_updated_at on public.payment_methods;
create trigger trg_payment_methods_set_updated_at
before update on public.payment_methods
for each row execute function public.set_updated_at();

create table if not exists public.discount_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  percentage numeric,
  fixed_amount numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (percentage is null or percentage >= 0),
  check (fixed_amount is null or fixed_amount >= 0)
);

drop trigger if exists trg_discount_types_set_updated_at on public.discount_types;
create trigger trg_discount_types_set_updated_at
before update on public.discount_types
for each row execute function public.set_updated_at();

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  client_id uuid references public.clients(id),
  transaction_date timestamptz not null default now(),
  subtotal numeric not null default 0,
  discount_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_type text check (tax_type is null or tax_type in ('VAT', 'NON_VAT', 'NONE')),
  grand_total numeric not null default 0,
  total_amount numeric not null default 0,
  total_paid numeric not null default 0,
  balance numeric not null default 0,
  payment_status text not null default 'Unpaid'
    check (payment_status in ('Paid', 'Partial', 'Unpaid', 'Overpaid', 'Void')),
  notes text,
  created_by text,
  is_void boolean not null default false,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_client_idx on public.transactions (client_id);
create index if not exists transactions_date_idx on public.transactions (transaction_date desc);
create index if not exists transactions_status_idx on public.transactions (payment_status);

create or replace function public.set_transaction_number()
returns trigger
language plpgsql
as $$
begin
  if new.transaction_number is null or length(trim(new.transaction_number)) = 0 then
    new.transaction_number :=
      'TXN-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') ||
      '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transactions_set_transaction_number on public.transactions;
create trigger trg_transactions_set_transaction_number
before insert on public.transactions
for each row execute function public.set_transaction_number();

drop trigger if exists trg_transactions_set_updated_at on public.transactions;
create trigger trg_transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  service_id uuid references public.services(id),
  service_name text not null,
  quantity integer not null default 1,
  unit_price numeric not null default 0,
  discount_amount numeric not null default 0,
  line_total numeric not null default 0,
  associate_id uuid references public.mental_health_associates(id),
  associate_name text,
  referral_id uuid references public.referrals(id),
  referral_name text,
  created_at timestamptz not null default now()
);

create index if not exists transaction_items_transaction_idx
  on public.transaction_items (transaction_id);
create index if not exists transaction_items_service_idx
  on public.transaction_items (service_id);
create index if not exists transaction_items_referral_idx
  on public.transaction_items (referral_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  payment_method text not null,
  amount numeric not null default 0,
  reference_number text,
  payment_date timestamptz not null default now(),
  received_by text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists payments_transaction_idx on public.payments (transaction_id);
create index if not exists payments_date_idx on public.payments (payment_date desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  performed_by text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_record_idx on public.audit_logs (record_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique,
  room_type text,
  capacity integer not null default 1,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.associate_availability (
  id uuid primary key default gen_random_uuid(),
  associate_id uuid not null references public.mental_health_associates(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create table if not exists public.associate_services (
  id uuid primary key default gen_random_uuid(),
  associate_id uuid not null references public.mental_health_associates(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  is_preferred boolean not null default false,
  skill_level text not null default 'qualified'
    check (skill_level in ('qualified', 'preferred', 'specialist')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (associate_id, service_id)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  service_id uuid not null references public.services(id),
  associate_id uuid not null references public.mental_health_associates(id),
  referral_id uuid references public.referrals(id),
  room_id uuid references public.rooms(id),
  transaction_id uuid references public.transactions(id),
  transaction_item_id uuid references public.transaction_items(id),
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'Scheduled'
    check (status in ('Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show', 'Rescheduled')),
  appointment_type text not null default 'In-person'
    check (appointment_type in ('In-person', 'Online', 'Hybrid')),
  payment_status text not null default 'Unpaid'
    check (payment_status in ('Unpaid', 'Partial', 'Paid', 'Waived')),
  amount_due numeric not null default 0,
  amount_paid numeric not null default 0,
  notes text,
  cancellation_reason text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index if not exists rooms_is_active_idx on public.rooms (is_active);
create index if not exists associate_availability_associate_day_idx
  on public.associate_availability (associate_id, day_of_week, is_active);
create index if not exists associate_services_associate_idx
  on public.associate_services (associate_id, is_active);
create index if not exists associate_services_service_idx
  on public.associate_services (service_id, is_active, skill_level, is_preferred);
create index if not exists appointments_date_idx on public.appointments (appointment_date);
create index if not exists appointments_associate_time_idx
  on public.appointments (associate_id, appointment_date, start_time, end_time, status);
create index if not exists appointments_room_time_idx
  on public.appointments (room_id, appointment_date, start_time, end_time, status);
create index if not exists appointments_client_time_idx
  on public.appointments (client_id, appointment_date, start_time, end_time, status);
create index if not exists appointments_referral_idx on public.appointments (referral_id);
create index if not exists appointments_transaction_idx on public.appointments (transaction_id);

drop trigger if exists trg_rooms_set_updated_at on public.rooms;
create trigger trg_rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_set_updated_at on public.appointments;
create trigger trg_appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  auth_user_id uuid,
  role text,
  question text not null,
  answer text,
  tools_used jsonb not null default '[]'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_logs_auth_user_created_idx
  on public.ai_logs (auth_user_id, created_at desc);
create index if not exists ai_logs_created_idx on public.ai_logs (created_at desc);

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

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_number text not null unique,
  category_id uuid references public.expense_categories(id),
  expense_date date not null default ((now() at time zone 'Asia/Manila')::date),
  paid_date date,
  vendor text,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  payment_method text,
  reference_number text,
  recurrence text not null default 'One-time'
    check (recurrence in ('One-time', 'Weekly', 'Monthly', 'Quarterly', 'Yearly')),
  status text not null default 'Paid'
    check (status in ('Pending', 'Paid', 'Void')),
  receipt_url text,
  notes text,
  created_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'Paid' or paid_date is not null)
);

create sequence if not exists public.expense_number_seq;

create or replace function public.set_expense_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.expense_number is null or length(trim(new.expense_number)) = 0 then
    new.expense_number :=
      'EXP-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMM') ||
      '-' || lpad(nextval('public.expense_number_seq')::text, 5, '0');
  end if;

  if new.status = 'Paid' and new.paid_date is null then
    new.paid_date := new.expense_date;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expenses_set_expense_number on public.expenses;
create trigger trg_expenses_set_expense_number
before insert on public.expenses
for each row execute function public.set_expense_number();

drop trigger if exists trg_expense_categories_set_updated_at on public.expense_categories;
create trigger trg_expense_categories_set_updated_at
before update on public.expense_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_expenses_set_updated_at on public.expenses;
create trigger trg_expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create index if not exists expense_categories_active_idx
  on public.expense_categories (is_active, name);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_paid_date_idx on public.expenses (paid_date desc);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_status_idx on public.expenses (status);

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

create or replace function public.is_scheduling_user(auth_id uuid)
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
      and role in ('admin', 'manager', 'regular_user')
      and is_active = true
  );
$$;

create or replace function public.ai_can_use_assistant(auth_id uuid)
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
      and role in ('admin', 'manager', 'regular_user')
      and is_active = true
  );
$$;

create or replace function public.ai_is_admin_user(auth_id uuid)
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
revoke all on function public.is_finance_user(uuid) from public;
revoke all on function public.is_scheduling_user(uuid) from public;
revoke all on function public.ai_can_use_assistant(uuid) from public;
revoke all on function public.ai_is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated;
grant execute on function public.is_finance_user(uuid) to authenticated;
grant execute on function public.is_scheduling_user(uuid) to authenticated;
grant execute on function public.ai_can_use_assistant(uuid) to authenticated;
grant execute on function public.ai_is_admin_user(uuid) to authenticated;

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
    'expense_user',
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

revoke all on function public.admin_create_user(text, text, text, text, boolean) from public;
grant execute on function public.admin_create_user(text, text, text, text, boolean) to authenticated;

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

revoke all on function public.admin_set_user_password(uuid, text) from public;
revoke all on function public.complete_password_change() from public;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
grant execute on function public.complete_password_change() to authenticated;

create or replace function public.audit_clinic_tax_settings_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    old.tax_enabled is distinct from new.tax_enabled
    or old.tax_type is distinct from new.tax_type
    or old.tax_rate is distinct from new.tax_rate
    or old.tax_inclusive is distinct from new.tax_inclusive
    or old.bir_registered is distinct from new.bir_registered
    or old.tin_number is distinct from new.tin_number
  then
    insert into public.audit_logs (
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      reason,
      performed_by
    )
    values (
      'clinic_settings',
      new.id,
      'UPDATE_TAX_SETTINGS',
      jsonb_build_object(
        'tax_enabled', old.tax_enabled,
        'tax_type', old.tax_type,
        'tax_rate', old.tax_rate,
        'tax_inclusive', old.tax_inclusive,
        'bir_registered', old.bir_registered,
        'tin_number', old.tin_number
      ),
      jsonb_build_object(
        'tax_enabled', new.tax_enabled,
        'tax_type', new.tax_type,
        'tax_rate', new.tax_rate,
        'tax_inclusive', new.tax_inclusive,
        'bir_registered', new.bir_registered,
        'tin_number', new.tin_number
      ),
      'Tax configuration updated',
      'System'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_clinic_tax_settings_changes
on public.clinic_settings;

create trigger trg_audit_clinic_tax_settings_changes
after update on public.clinic_settings
for each row
execute function public.audit_clinic_tax_settings_changes();

create or replace function public.ai_get_today_appointments(
  target_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.start_time)
    from (
      select
        a.id,
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.status,
        a.appointment_type,
        a.payment_status,
        a.amount_due,
        a.amount_paid,
        c.full_name as client_name,
        s.name as service_name,
        mha.full_name as associate_name,
        r.room_name,
        ref.referral_name
      from public.appointments a
      left join public.clients c on c.id = a.client_id
      left join public.services s on s.id = a.service_id
      left join public.mental_health_associates mha on mha.id = a.associate_id
      left join public.rooms r on r.id = a.room_id
      left join public.referrals ref on ref.id = a.referral_id
      where a.appointment_date = target_date
        and a.status <> 'Cancelled'
      order by a.start_time
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_appointment_summary(
  start_date date,
  end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    with filtered as (
      select
        a.id,
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.status,
        a.appointment_type,
        a.payment_status,
        a.amount_due,
        a.amount_paid,
        c.full_name as client_name,
        s.name as service_name,
        mha.full_name as associate_name,
        r.room_name,
        ref.referral_name
      from public.appointments a
      left join public.clients c on c.id = a.client_id
      left join public.services s on s.id = a.service_id
      left join public.mental_health_associates mha on mha.id = a.associate_id
      left join public.rooms r on r.id = a.room_id
      left join public.referrals ref on ref.id = a.referral_id
      where a.appointment_date between start_date and end_date
        and a.status <> 'Cancelled'
    ),
    by_status as (
      select jsonb_object_agg(status, count) as counts
      from (
        select status, count(*) as count
        from filtered
        group by status
      ) rows
    ),
    by_date as (
      select jsonb_agg(to_jsonb(rows) order by rows.appointment_date) as dates
      from (
        select appointment_date, count(*) as appointment_count
        from filtered
        group by appointment_date
      ) rows
    ),
    by_associate as (
      select jsonb_agg(to_jsonb(rows) order by rows.appointment_count desc, rows.associate_name) as associates
      from (
        select coalesce(associate_name, 'Unassigned') as associate_name, count(*) as appointment_count
        from filtered
        group by coalesce(associate_name, 'Unassigned')
      ) rows
    ),
    details as (
      select jsonb_agg(to_jsonb(rows) order by rows.appointment_date, rows.start_time) as appointments
      from (
        select *
        from filtered
        order by appointment_date, start_time
        limit 50
      ) rows
    )
    select jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date,
      'appointment_count', (select count(*) from filtered),
      'status_counts', coalesce((select counts from by_status), '{}'::jsonb),
      'appointments_by_date', coalesce((select dates from by_date), '[]'::jsonb),
      'appointments_by_associate', coalesce((select associates from by_associate), '[]'::jsonb),
      'appointments', coalesce((select appointments from details), '[]'::jsonb)
    )
  ), '{}'::jsonb);
end;
$$;

create or replace function public.ai_get_available_rooms(
  target_date date default ((now() at time zone 'Asia/Manila')::date),
  start_at time default null,
  end_at time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.room_name)
    from (
      select
        r.id,
        r.room_name,
        r.room_type,
        r.capacity,
        r.notes,
        case
          when start_at is null or end_at is null then true
          else not exists (
            select 1
            from public.appointments a
            where a.room_id = r.id
              and a.appointment_date = target_date
              and a.status <> 'Cancelled'
              and a.start_time < end_at
              and a.end_time > start_at
          )
        end as is_available,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'appointment_id', a.id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'status', a.status
          ) order by a.start_time)
          from public.appointments a
          where a.room_id = r.id
            and a.appointment_date = target_date
            and a.status <> 'Cancelled'
        ), '[]'::jsonb) as appointments
      from public.rooms r
      where r.is_active = true
      order by r.room_name
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_associate_availability(
  target_date date default ((now() at time zone 'Asia/Manila')::date),
  associate_id_filter uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_day integer := extract(dow from target_date)::integer;
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.associate_name)
    from (
      select
        mha.id,
        mha.full_name as associate_name,
        mha.title,
        mha.profession,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'start_time', av.start_time,
            'end_time', av.end_time
          ) order by av.start_time)
          from public.associate_availability av
          where av.associate_id = mha.id
            and av.day_of_week = target_day
            and av.is_active = true
        ), '[]'::jsonb) as availability,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'appointment_id', a.id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'status', a.status,
            'service_name', s.name,
            'client_name', c.full_name
          ) order by a.start_time)
          from public.appointments a
          left join public.services s on s.id = a.service_id
          left join public.clients c on c.id = a.client_id
          where a.associate_id = mha.id
            and a.appointment_date = target_date
            and a.status <> 'Cancelled'
        ), '[]'::jsonb) as appointments
      from public.mental_health_associates mha
      where mha.is_active = true
        and (associate_id_filter is null or mha.id = associate_id_filter)
      order by mha.full_name
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_unpaid_transactions(
  limit_count integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.transaction_date desc)
    from (
      select
        t.id,
        t.transaction_number,
        t.transaction_date,
        c.full_name as client_name,
        t.total_amount,
        t.total_paid,
        t.balance,
        t.payment_status,
        t.notes
      from public.transactions t
      left join public.clients c on c.id = t.client_id
      where coalesce(t.is_void, false) = false
        and (
          coalesce(t.balance, 0) > 0
          or t.payment_status in ('Unpaid', 'Partial')
        )
      order by t.transaction_date desc
      limit greatest(1, least(coalesce(limit_count, 20), 100))
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_revenue_summary(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    with filtered as (
      select *
      from public.transactions t
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
    ),
    payment_rollup as (
      select
        p.transaction_id,
        sum(case when p.amount > 0 then p.amount else 0 end) as payments_collected,
        sum(case when p.amount < 0 then abs(p.amount) else 0 end) as refunds_recorded
      from public.payments p
      join filtered f on f.id = p.transaction_id
      group by p.transaction_id
    )
    select jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date,
      'transaction_count', count(f.id),
      'gross_sales', coalesce(sum(f.total_amount), 0),
      'subtotal', coalesce(sum(f.subtotal), 0),
      'discounts', coalesce(sum(f.discount_amount), 0),
      'tax', coalesce(sum(f.tax_amount), 0),
      'payments_collected', coalesce(sum(pr.payments_collected), 0),
      'refunds_recorded', coalesce(sum(pr.refunds_recorded), 0),
      'net_collected', coalesce(sum(pr.payments_collected), 0) - coalesce(sum(pr.refunds_recorded), 0),
      'outstanding_balance', coalesce(sum(f.balance), 0),
      'paid_count', count(*) filter (where f.payment_status = 'Paid'),
      'partial_count', count(*) filter (where f.payment_status = 'Partial'),
      'unpaid_count', count(*) filter (where f.payment_status = 'Unpaid')
    )
    from filtered f
    left join payment_rollup pr on pr.transaction_id = f.id
  ), '{}'::jsonb);
end;
$$;

create or replace function public.ai_get_referral_summary(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.revenue desc)
    from (
      select
        coalesce(ti.referral_name, 'No referral') as referral_name,
        count(distinct t.id) as transaction_count,
        count(ti.id) as line_item_count,
        coalesce(sum(ti.line_total), 0) as revenue
      from public.transaction_items ti
      join public.transactions t on t.id = ti.transaction_id
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
      group by coalesce(ti.referral_name, 'No referral')
      order by revenue desc
      limit 25
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_service_performance(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.revenue desc)
    from (
      select
        ti.service_name,
        count(distinct t.id) as transaction_count,
        sum(ti.quantity) as quantity_sold,
        coalesce(sum(ti.quantity * ti.unit_price), 0) as gross_amount,
        coalesce(sum(ti.discount_amount), 0) as discounts,
        coalesce(sum(ti.line_total), 0) as revenue
      from public.transaction_items ti
      join public.transactions t on t.id = ti.transaction_id
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
      group by ti.service_name
      order by revenue desc
      limit 25
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.ai_get_today_appointments(date) from public;
revoke all on function public.ai_get_appointment_summary(date, date) from public;
revoke all on function public.ai_get_available_rooms(date, time, time) from public;
revoke all on function public.ai_get_associate_availability(date, uuid) from public;
revoke all on function public.ai_get_unpaid_transactions(integer) from public;
revoke all on function public.ai_get_revenue_summary(date, date) from public;
revoke all on function public.ai_get_referral_summary(date, date) from public;
revoke all on function public.ai_get_service_performance(date, date) from public;

grant execute on function public.ai_get_today_appointments(date) to authenticated;
grant execute on function public.ai_get_appointment_summary(date, date) to authenticated;
grant execute on function public.ai_get_available_rooms(date, time, time) to authenticated;
grant execute on function public.ai_get_associate_availability(date, uuid) to authenticated;
grant execute on function public.ai_get_unpaid_transactions(integer) to authenticated;
grant execute on function public.ai_get_revenue_summary(date, date) to authenticated;
grant execute on function public.ai_get_referral_summary(date, date) to authenticated;
grant execute on function public.ai_get_service_performance(date, date) to authenticated;

do $$
declare
  admin_auth_user_id uuid;
  admin_email text := 'admin@psyzygyclinic.com';
  admin_password text := 'Admin@123456';
begin
  select id into admin_auth_user_id
  from auth.users
  where lower(email) = lower(admin_email);

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

  insert into public.users (auth_user_id, full_name, email, role, is_active)
  values (admin_auth_user_id, 'Admin User', admin_email, 'admin', true)
  on conflict (email) do update
  set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();
end $$;

insert into public.clinic_settings (
  clinic_name,
  address,
  contact_number,
  email,
  currency,
  privacy_notice,
  receipt_footer,
  tax_enabled,
  tax_type,
  tax_rate,
  tax_inclusive,
  bir_registered
)
select
  'Psyzygy Clinic',
  '',
  '',
  '',
  'PHP',
  'Client information is handled according to clinic privacy policies.',
  'Thank you for choosing Psyzygy Clinic.',
  true,
  'NON_VAT',
  12,
  true,
  false
where not exists (select 1 from public.clinic_settings);

insert into public.payment_methods (name, is_active)
values
  ('Cash', true),
  ('GCash', true),
  ('Maya', true),
  ('Bank Transfer', true),
  ('Credit/Debit Card', true)
on conflict (name) do nothing;

insert into public.discount_types (name, percentage, fixed_amount, is_active)
values
  ('Senior Citizen', 20, null, true),
  ('PWD', 20, null, true),
  ('Employee Discount', 10, null, true)
on conflict (name) do nothing;

insert into public.rooms (room_name, room_type, capacity, is_active)
values
  ('Counseling Room 1', 'Counseling', 2, true),
  ('Counseling Room 2', 'Counseling', 2, true),
  ('Assessment Room', 'Assessment', 3, true),
  ('Play Therapy Room', 'Therapy', 4, true),
  ('Online Session', 'Online', 1, true)
on conflict (room_name) do nothing;

insert into public.expense_categories (name, description)
values
  ('Rent', 'Clinic rent and lease payments'),
  ('Utilities', 'Electricity, water, internet, and telephone'),
  ('Payroll', 'Salaries, wages, and staff benefits'),
  ('Professional Fees', 'Associate and external professional fees'),
  ('Clinic Supplies', 'Clinical, office, and sanitation supplies'),
  ('Software & Subscriptions', 'Software licenses and online services'),
  ('Marketing', 'Advertising and promotional expenses'),
  ('Taxes & Government Fees', 'Taxes, permits, and regulatory fees'),
  ('Repairs & Maintenance', 'Equipment and facility maintenance'),
  ('Other', 'Unclassified operating expenses')
on conflict (name) do nothing;

do $$
declare
  target_table text;
  policy_name text;
  table_names text[] := array[
    'clients',
    'services',
    'mental_health_associates',
    'referrals',
    'clinic_settings',
    'payment_methods',
    'discount_types',
    'transactions',
    'transaction_items',
    'payments',
    'audit_logs',
    'rooms',
    'associate_availability',
    'associate_services',
    'appointments'
  ];
begin
  foreach target_table in array table_names loop
    execute format('alter table public.%I enable row level security', target_table);

    policy_name := target_table || '_authenticated_all';
    execute format('drop policy if exists %I on public.%I', policy_name, target_table);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_scheduling_user(auth.uid())) with check (public.is_scheduling_user(auth.uid()))',
      policy_name,
      target_table
    );
  end loop;
end $$;

alter table public.users enable row level security;
drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_admin_only on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_update_admin_only on public.users;
drop policy if exists users_delete_admin_only on public.users;

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
with check (public.is_admin_user(auth.uid()));

create policy users_update_admin_only
on public.users
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy users_delete_admin_only
on public.users
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

alter table public.ai_logs enable row level security;
drop policy if exists ai_logs_insert_allowed_users on public.ai_logs;
drop policy if exists ai_logs_select_own_or_admin on public.ai_logs;

create policy ai_logs_insert_allowed_users
on public.ai_logs
for insert
to authenticated
with check (
  public.ai_can_use_assistant(auth.uid())
  and auth_user_id = auth.uid()
);

create policy ai_logs_select_own_or_admin
on public.ai_logs
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.ai_is_admin_user(auth.uid())
);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists expense_categories_finance_all on public.expense_categories;
create policy expense_categories_finance_all
on public.expense_categories
for all
to authenticated
using (public.is_finance_user(auth.uid()))
with check (public.is_finance_user(auth.uid()));

drop policy if exists expenses_finance_all on public.expenses;
create policy expenses_finance_all
on public.expenses
for all
to authenticated
using (public.is_finance_user(auth.uid()))
with check (public.is_finance_user(auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_finance_select on storage.objects;
create policy expense_receipts_finance_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);

drop policy if exists expense_receipts_finance_insert on storage.objects;
create policy expense_receipts_finance_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);

drop policy if exists expense_receipts_finance_update on storage.objects;
create policy expense_receipts_finance_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
)
with check (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
grant usage, select on sequences to authenticated;

-- ============================================================================
-- BEGIN INCLUDED CASE MANAGEMENT INSTALLER
-- Sources: database/8 through database/12 plus database/18, preserved in execution order.
-- ============================================================================

-- ============================================================================
-- INCLUDED SOURCE: database/8_add_case_management_module.sql
-- ============================================================================
-- Case Management module database structure.
-- Run after the base POS, scheduling, and user-management schema is in place.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.mental_health_associates
  add column if not exists user_id uuid references public.users(id) on delete set null;

create unique index if not exists mental_health_associates_user_id_unique_idx
  on public.mental_health_associates (user_id)
  where user_id is not null;

create index if not exists mental_health_associates_user_id_idx
  on public.mental_health_associates (user_id);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  client_id uuid not null references public.clients(id),
  service_id uuid references public.services(id),
  transaction_id uuid references public.transactions(id),
  transaction_item_id uuid references public.transaction_items(id),
  appointment_id uuid references public.appointments(id),
  associate_id uuid references public.mental_health_associates(id),
  case_type text not null default 'Assessment',
  status text not null default 'New'
    check (
      status in (
        'New',
        'Scheduled',
        'Testing Ongoing',
        'Testing Completed',
        'Scoring',
        'Interpretation',
        'Report Writing',
        'For Review',
        'For Revision',
        'Ready for Release',
        'Released',
        'Closed',
        'Cancelled'
      )
    ),
  priority text not null default 'Normal'
    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  presenting_concern text,
  internal_notes text,
  report_due_date date,
  released_at timestamptz,
  closed_at timestamptz,
  created_by_user_id uuid references public.users(id),
  updated_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cases_client_idx
  on public.cases (client_id);

create index if not exists cases_service_idx
  on public.cases (service_id);

create index if not exists cases_transaction_idx
  on public.cases (transaction_id);

create index if not exists cases_transaction_item_idx
  on public.cases (transaction_item_id);

create index if not exists cases_appointment_idx
  on public.cases (appointment_id);

create index if not exists cases_associate_idx
  on public.cases (associate_id);

create index if not exists cases_status_idx
  on public.cases (status);

create index if not exists cases_report_due_date_idx
  on public.cases (report_due_date);

create or replace function public.set_case_number()
returns trigger
language plpgsql
as $$
begin
  if new.case_number is null or length(trim(new.case_number)) = 0 then
    new.case_number :=
      'CASE-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMMDD') ||
      '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cases_set_case_number on public.cases;
create trigger trg_cases_set_case_number
before insert on public.cases
for each row execute function public.set_case_number();

drop trigger if exists trg_cases_set_updated_at on public.cases;
create trigger trg_cases_set_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

create table if not exists public.case_progress_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  from_status text
    check (
      from_status is null or from_status in (
        'New',
        'Scheduled',
        'Testing Ongoing',
        'Testing Completed',
        'Scoring',
        'Interpretation',
        'Report Writing',
        'For Review',
        'For Revision',
        'Ready for Release',
        'Released',
        'Closed',
        'Cancelled'
      )
    ),
  to_status text not null
    check (
      to_status in (
        'New',
        'Scheduled',
        'Testing Ongoing',
        'Testing Completed',
        'Scoring',
        'Interpretation',
        'Report Writing',
        'For Review',
        'For Revision',
        'Ready for Release',
        'Released',
        'Closed',
        'Cancelled'
      )
    ),
  notes text,
  changed_by_user_id uuid references public.users(id),
  changed_by_associate_id uuid references public.mental_health_associates(id),
  created_at timestamptz not null default now()
);

create index if not exists case_progress_logs_case_created_idx
  on public.case_progress_logs (case_id, created_at desc);

create index if not exists case_progress_logs_to_status_idx
  on public.case_progress_logs (to_status);

create table if not exists public.case_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'Pending'
    check (status in ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  assigned_to_user_id uuid references public.users(id),
  assigned_to_associate_id uuid references public.mental_health_associates(id),
  due_date date,
  completed_at timestamptz,
  created_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_tasks_case_idx
  on public.case_tasks (case_id);

create index if not exists case_tasks_status_idx
  on public.case_tasks (status);

create index if not exists case_tasks_assigned_user_idx
  on public.case_tasks (assigned_to_user_id);

create index if not exists case_tasks_assigned_associate_idx
  on public.case_tasks (assigned_to_associate_id);

create index if not exists case_tasks_due_date_idx
  on public.case_tasks (due_date);

drop trigger if exists trg_case_tasks_set_updated_at on public.case_tasks;
create trigger trg_case_tasks_set_updated_at
before update on public.case_tasks
for each row execute function public.set_updated_at();

alter table public.cases enable row level security;
alter table public.case_progress_logs enable row level security;
alter table public.case_tasks enable row level security;

drop policy if exists cases_select_scheduling_users on public.cases;
drop policy if exists cases_insert_scheduling_users on public.cases;
drop policy if exists cases_update_scheduling_users on public.cases;
drop policy if exists cases_delete_admin_users on public.cases;

create policy cases_select_scheduling_users
on public.cases
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy cases_insert_scheduling_users
on public.cases
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy cases_update_scheduling_users
on public.cases
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

create policy cases_delete_admin_users
on public.cases
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists case_progress_logs_select_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_insert_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_update_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_delete_admin_users on public.case_progress_logs;

create policy case_progress_logs_select_scheduling_users
on public.case_progress_logs
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy case_progress_logs_insert_scheduling_users
on public.case_progress_logs
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy case_progress_logs_update_scheduling_users
on public.case_progress_logs
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

create policy case_progress_logs_delete_admin_users
on public.case_progress_logs
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists case_tasks_select_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_insert_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_update_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_delete_admin_users on public.case_tasks;

create policy case_tasks_select_scheduling_users
on public.case_tasks
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy case_tasks_insert_scheduling_users
on public.case_tasks
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy case_tasks_update_scheduling_users
on public.case_tasks
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

create policy case_tasks_delete_admin_users
on public.case_tasks
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

-- ============================================================================
-- INCLUDED SOURCE: database/9_add_case_management_backend_api.sql
-- ============================================================================
-- Backend/API support for Case Management.
-- Run after database/8_add_case_management_module.sql.

alter table public.cases
  add column if not exists target_release_date date;

create index if not exists cases_target_release_date_idx
  on public.cases (target_release_date);

create or replace function public.case_status_values()
returns text[]
language sql
immutable
as $$
  select array[
    'New',
    'Scheduled',
    'Testing Ongoing',
    'Testing Completed',
    'Scoring',
    'Interpretation',
    'Report Writing',
    'For Review',
    'For Revision',
    'Ready for Release',
    'Released',
    'Closed',
    'Cancelled'
  ]::text[];
$$;

create or replace function public.case_task_status_values()
returns text[]
language sql
immutable
as $$
  select array['Pending', 'In Progress', 'Completed', 'Cancelled']::text[];
$$;

create or replace function public.case_is_valid_status(status_value text)
returns boolean
language sql
immutable
as $$
  select status_value = any(public.case_status_values());
$$;

create or replace function public.case_is_valid_task_status(status_value text)
returns boolean
language sql
immutable
as $$
  select status_value = any(public.case_task_status_values());
$$;

create or replace function public.case_current_user_id()
returns uuid
language sql
security definer
set search_path = public
set row_security = off
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.case_current_associate_id()
returns uuid
language sql
security definer
set search_path = public
set row_security = off
as $$
  select mha.id
  from public.mental_health_associates mha
  join public.users u on u.id = mha.user_id
  where u.auth_user_id = auth.uid()
    and u.is_active = true
    and mha.is_active = true
  limit 1;
$$;

create or replace function public.case_is_privileged_user()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
      and role in ('admin', 'manager')
      and is_active = true
  );
$$;

create or replace function public.case_can_access_associate(associate_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select
    public.case_is_privileged_user()
    or public.case_current_associate_id() is null
    or (
      associate_id is not null
      and associate_id = public.case_current_associate_id()
    );
$$;

create or replace function public.case_to_json(case_row public.cases)
returns jsonb
language sql
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'id', case_row.id,
    'case_number', case_row.case_number,
    'client_id', case_row.client_id,
    'client_name', (select full_name from public.clients where id = case_row.client_id),
    'service_id', case_row.service_id,
    'service_name', (select name from public.services where id = case_row.service_id),
    'transaction_id', case_row.transaction_id,
    'transaction_item_id', case_row.transaction_item_id,
    'appointment_id', case_row.appointment_id,
    'associate_id', case_row.associate_id,
    'associate_name', (
      select full_name
      from public.mental_health_associates
      where id = case_row.associate_id
    ),
    'case_type', case_row.case_type,
    'status', case_row.status,
    'priority', case_row.priority,
    'presenting_concern', case_row.presenting_concern,
    'internal_notes', case_row.internal_notes,
    'report_due_date', case_row.report_due_date,
    'target_release_date', case_row.target_release_date,
    'released_at', case_row.released_at,
    'closed_at', case_row.closed_at,
    'created_by_user_id', case_row.created_by_user_id,
    'updated_by_user_id', case_row.updated_by_user_id,
    'created_at', case_row.created_at,
    'updated_at', case_row.updated_at
  );
$$;

create or replace function public.case_task_to_json(task_row public.case_tasks)
returns jsonb
language sql
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'id', task_row.id,
    'case_id', task_row.case_id,
    'title', task_row.title,
    'description', task_row.description,
    'status', task_row.status,
    'assigned_to_user_id', task_row.assigned_to_user_id,
    'assigned_to_associate_id', task_row.assigned_to_associate_id,
    'assigned_to_associate_name', (
      select full_name
      from public.mental_health_associates
      where id = task_row.assigned_to_associate_id
    ),
    'due_date', task_row.due_date,
    'completed_at', task_row.completed_at,
    'created_by_user_id', task_row.created_by_user_id,
    'created_at', task_row.created_at,
    'updated_at', task_row.updated_at
  );
$$;

create or replace function public.case_status_change_logger()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.status is distinct from new.status then
    insert into public.case_progress_logs (
      case_id,
      from_status,
      to_status,
      notes,
      changed_by_user_id,
      changed_by_associate_id
    )
    values (
      new.id,
      old.status,
      new.status,
      null,
      new.updated_by_user_id,
      public.case_current_associate_id()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cases_log_status_change on public.cases;
create trigger trg_cases_log_status_change
after update of status on public.cases
for each row
execute function public.case_status_change_logger();

create or replace function public.case_create_manual(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  new_case public.cases;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'New');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create cases.');
  end if;

  if not public.case_is_valid_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || requested_status);
  end if;

  if payload->>'client_id' is null or payload->>'client_id' = '' then
    return jsonb_build_object('success', false, 'message', 'Client is required to create a case.');
  end if;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    appointment_id,
    associate_id,
    case_type,
    status,
    priority,
    presenting_concern,
    internal_notes,
    report_due_date,
    target_release_date,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    nullif(payload->>'case_number', ''),
    (payload->>'client_id')::uuid,
    nullif(payload->>'service_id', '')::uuid,
    nullif(payload->>'transaction_id', '')::uuid,
    nullif(payload->>'transaction_item_id', '')::uuid,
    nullif(payload->>'appointment_id', '')::uuid,
    nullif(payload->>'associate_id', '')::uuid,
    coalesce(nullif(payload->>'case_type', ''), 'Assessment'),
    requested_status,
    coalesce(nullif(payload->>'priority', ''), 'Normal'),
    nullif(payload->>'presenting_concern', ''),
    nullif(payload->>'internal_notes', ''),
    nullif(payload->>'report_due_date', '')::date,
    coalesce(
      nullif(payload->>'target_release_date', '')::date,
      nullif(payload->>'report_due_date', '')::date
    ),
    current_user_id,
    current_user_id
  )
  returning * into new_case;

  insert into public.case_progress_logs (
    case_id,
    from_status,
    to_status,
    notes,
    changed_by_user_id,
    changed_by_associate_id
  )
  values (
    new_case.id,
    null,
    new_case.status,
    'Case created',
    current_user_id,
    public.case_current_associate_id()
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Case created successfully.',
    'data', public.case_to_json(new_case)
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more linked records do not exist.');
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more IDs are invalid.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_create_from_transaction_item(
  target_transaction_item_id uuid,
  payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_item record;
  linked_appointment_id uuid;
  new_case public.cases;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'New');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create cases.');
  end if;

  if not public.case_is_valid_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || requested_status);
  end if;

  select
    ti.id as transaction_item_id,
    ti.transaction_id,
    ti.service_id,
    ti.associate_id,
    t.client_id
  into source_item
  from public.transaction_items ti
  join public.transactions t on t.id = ti.transaction_id
  where ti.id = target_transaction_item_id;

  if source_item.transaction_item_id is null then
    return jsonb_build_object('success', false, 'message', 'Transaction item was not found.');
  end if;

  select id
  into linked_appointment_id
  from public.appointments
  where transaction_item_id = target_transaction_item_id
  order by created_at desc
  limit 1;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    appointment_id,
    associate_id,
    case_type,
    status,
    priority,
    presenting_concern,
    internal_notes,
    report_due_date,
    target_release_date,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    nullif(payload->>'case_number', ''),
    source_item.client_id,
    coalesce(nullif(payload->>'service_id', '')::uuid, source_item.service_id),
    source_item.transaction_id,
    source_item.transaction_item_id,
    coalesce(nullif(payload->>'appointment_id', '')::uuid, linked_appointment_id),
    coalesce(nullif(payload->>'associate_id', '')::uuid, source_item.associate_id),
    coalesce(nullif(payload->>'case_type', ''), 'Assessment'),
    requested_status,
    coalesce(nullif(payload->>'priority', ''), 'Normal'),
    nullif(payload->>'presenting_concern', ''),
    nullif(payload->>'internal_notes', ''),
    nullif(payload->>'report_due_date', '')::date,
    coalesce(
      nullif(payload->>'target_release_date', '')::date,
      nullif(payload->>'report_due_date', '')::date
    ),
    current_user_id,
    current_user_id
  )
  returning * into new_case;

  insert into public.case_progress_logs (
    case_id,
    from_status,
    to_status,
    notes,
    changed_by_user_id,
    changed_by_associate_id
  )
  values (
    new_case.id,
    null,
    new_case.status,
    'Case created from transaction item',
    current_user_id,
    public.case_current_associate_id()
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Case created from transaction item successfully.',
    'data', public.case_to_json(new_case)
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more linked records do not exist.');
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more IDs are invalid.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_list_all()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_client(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Client cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.client_id = target_client_id
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_associate(target_associate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  if not public.case_can_access_associate(target_associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases assigned to this associate.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Associate cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.associate_id = target_associate_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_status(target_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  if not public.case_is_valid_status(target_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || coalesce(target_status, ''));
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Cases loaded by status successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.status = target_status
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_overdue(target_date date default ((now() at time zone 'Asia/Manila')::date))
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Overdue cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.target_release_date asc, c.created_at desc)
      from public.cases c
      where c.target_release_date is not null
        and c.target_release_date < target_date
        and c.status not in ('Released', 'Closed', 'Cancelled')
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_update_status(
  target_case_id uuid,
  new_status text,
  status_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  previous_case public.cases;
  updated_case public.cases;
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update cases.');
  end if;

  if not public.case_is_valid_status(new_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || coalesce(new_status, ''));
  end if;

  select *
  into previous_case
  from public.cases
  where id = target_case_id;

  if previous_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  if not public.case_can_access_associate(previous_case.associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update this case.');
  end if;

  update public.cases
  set
    status = new_status,
    updated_by_user_id = current_user_id,
    released_at = case when new_status = 'Released' then coalesce(released_at, now()) else released_at end,
    closed_at = case when new_status in ('Closed', 'Cancelled') then coalesce(closed_at, now()) else closed_at end
  where id = target_case_id
  returning * into updated_case;

  if previous_case.status is distinct from new_status and nullif(status_notes, '') is not null then
    update public.case_progress_logs
    set notes = status_notes
    where id = (
      select id
      from public.case_progress_logs
      where case_id = target_case_id
        and from_status = previous_case.status
        and to_status = new_status
      order by created_at desc
      limit 1
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case status updated successfully.',
    'data', public.case_to_json(updated_case)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_task_create(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  parent_case public.cases;
  new_task public.case_tasks;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'Pending');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create case tasks.');
  end if;

  if payload->>'case_id' is null or payload->>'case_id' = '' then
    return jsonb_build_object('success', false, 'message', 'Case is required to create a task.');
  end if;

  if not public.case_is_valid_task_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid task status: ' || requested_status);
  end if;

  if payload->>'title' is null or length(trim(payload->>'title')) = 0 then
    return jsonb_build_object('success', false, 'message', 'Task title is required.');
  end if;

  select *
  into parent_case
  from public.cases
  where id = (payload->>'case_id')::uuid;

  if parent_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  if not public.case_can_access_associate(parent_case.associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create tasks for this case.');
  end if;

  insert into public.case_tasks (
    case_id,
    title,
    description,
    status,
    assigned_to_user_id,
    assigned_to_associate_id,
    due_date,
    completed_at,
    created_by_user_id
  )
  values (
    parent_case.id,
    trim(payload->>'title'),
    nullif(payload->>'description', ''),
    requested_status,
    nullif(payload->>'assigned_to_user_id', '')::uuid,
    nullif(payload->>'assigned_to_associate_id', '')::uuid,
    nullif(payload->>'due_date', '')::date,
    case when requested_status = 'Completed' then now() else null end,
    current_user_id
  )
  returning * into new_task;

  return jsonb_build_object(
    'success', true,
    'message', 'Case task created successfully.',
    'data', public.case_task_to_json(new_task)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Task could not be created because one or more IDs are invalid.');
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Task could not be created because one or more linked records do not exist.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_task_update(
  target_task_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing_task public.case_tasks;
  parent_case public.cases;
  updated_task public.case_tasks;
  requested_status text;
begin
  if not public.is_scheduling_user(auth.uid()) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update case tasks.');
  end if;

  select *
  into existing_task
  from public.case_tasks
  where id = target_task_id;

  if existing_task.id is null then
    return jsonb_build_object('success', false, 'message', 'Case task was not found.');
  end if;

  select *
  into parent_case
  from public.cases
  where id = existing_task.case_id;

  if not public.case_can_access_associate(parent_case.associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update this case task.');
  end if;

  requested_status := coalesce(nullif(payload->>'status', ''), existing_task.status);

  if not public.case_is_valid_task_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid task status: ' || requested_status);
  end if;

  update public.case_tasks
  set
    title = coalesce(nullif(payload->>'title', ''), title),
    description = case
      when payload ? 'description' then nullif(payload->>'description', '')
      else description
    end,
    status = requested_status,
    assigned_to_user_id = case
      when payload ? 'assigned_to_user_id' then nullif(payload->>'assigned_to_user_id', '')::uuid
      else assigned_to_user_id
    end,
    assigned_to_associate_id = case
      when payload ? 'assigned_to_associate_id' then nullif(payload->>'assigned_to_associate_id', '')::uuid
      else assigned_to_associate_id
    end,
    due_date = case
      when payload ? 'due_date' then nullif(payload->>'due_date', '')::date
      else due_date
    end,
    completed_at = case
      when requested_status = 'Completed' then coalesce(completed_at, now())
      when existing_task.status = 'Completed' and requested_status <> 'Completed' then null
      else completed_at
    end
  where id = target_task_id
  returning * into updated_task;

  return jsonb_build_object(
    'success', true,
    'message', 'Case task updated successfully.',
    'data', public.case_task_to_json(updated_task)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Task could not be updated because one or more IDs are invalid.');
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Task could not be updated because one or more linked records do not exist.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_task_complete(target_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  return public.case_task_update(target_task_id, '{"status":"Completed"}'::jsonb);
end;
$$;

grant execute on function public.case_create_manual(jsonb) to authenticated;
grant execute on function public.case_create_from_transaction_item(uuid, jsonb) to authenticated;
grant execute on function public.case_list_all() to authenticated;
grant execute on function public.case_list_by_client(uuid) to authenticated;
grant execute on function public.case_list_by_associate(uuid) to authenticated;
grant execute on function public.case_list_by_status(text) to authenticated;
grant execute on function public.case_list_overdue(date) to authenticated;
grant execute on function public.case_update_status(uuid, text, text) to authenticated;
grant execute on function public.case_task_create(jsonb) to authenticated;
grant execute on function public.case_task_update(uuid, jsonb) to authenticated;
grant execute on function public.case_task_complete(uuid) to authenticated;

-- ============================================================================
-- INCLUDED SOURCE: database/10_add_case_role_access.sql
-- ============================================================================
-- Role-based access control for Case Management.
-- Run after database/9_add_case_management_backend_api.sql.

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

create or replace function public.case_current_role()
returns text
language sql
security definer
set search_path = public
set row_security = off
as $$
  select role
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.case_can_use_module()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.case_current_role(), '') in (
    'admin',
    'manager',
    'case_staff',
    'associate_user',
    'case_viewer'
  );
$$;

create or replace function public.case_can_manage_cases()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.case_current_role(), '') in (
    'admin',
    'manager',
    'case_staff'
  );
$$;

create or replace function public.case_is_privileged_user()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.case_current_role(), '') in ('admin', 'manager');
$$;

create or replace function public.case_can_access_associate(associate_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select
    coalesce(public.case_current_role(), '') in (
      'admin',
      'manager',
      'case_staff',
      'case_viewer'
    )
    or (
      coalesce(public.case_current_role(), '') = 'associate_user'
      and associate_id is not null
      and associate_id = public.case_current_associate_id()
    );
$$;

create or replace function public.case_can_add_progress(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target_case_id
      and (
        public.case_can_manage_cases()
        or (
          coalesce(public.case_current_role(), '') = 'associate_user'
          and c.associate_id = public.case_current_associate_id()
        )
      )
  );
$$;

create or replace function public.case_can_update_task(target_task_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.case_tasks t
    join public.cases c on c.id = t.case_id
    where t.id = target_task_id
      and (
        public.case_can_manage_cases()
        or (
          coalesce(public.case_current_role(), '') = 'associate_user'
          and (
            t.assigned_to_associate_id = public.case_current_associate_id()
            or c.associate_id = public.case_current_associate_id()
          )
        )
      )
  );
$$;

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

  if new_role <> all(public.case_role_values()) then
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
      extensions.crypt(gen_random_uuid()::text || random()::text, extensions.gen_salt('bf')),
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

  insert into public.users (auth_user_id, full_name, email, role, is_active)
  values (new_auth_user_id, new_full_name, lower(new_email), new_role, new_is_active)
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

create or replace function public.case_create_manual(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  new_case public.cases;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'New');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create cases.');
  end if;

  if not public.case_is_valid_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || requested_status);
  end if;

  if payload->>'client_id' is null or payload->>'client_id' = '' then
    return jsonb_build_object('success', false, 'message', 'Client is required to create a case.');
  end if;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    appointment_id,
    associate_id,
    case_type,
    status,
    priority,
    presenting_concern,
    internal_notes,
    report_due_date,
    target_release_date,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    nullif(payload->>'case_number', ''),
    (payload->>'client_id')::uuid,
    nullif(payload->>'service_id', '')::uuid,
    nullif(payload->>'transaction_id', '')::uuid,
    nullif(payload->>'transaction_item_id', '')::uuid,
    nullif(payload->>'appointment_id', '')::uuid,
    nullif(payload->>'associate_id', '')::uuid,
    coalesce(nullif(payload->>'case_type', ''), 'Assessment'),
    requested_status,
    coalesce(nullif(payload->>'priority', ''), 'Normal'),
    nullif(payload->>'presenting_concern', ''),
    nullif(payload->>'internal_notes', ''),
    nullif(payload->>'report_due_date', '')::date,
    coalesce(
      nullif(payload->>'target_release_date', '')::date,
      nullif(payload->>'report_due_date', '')::date
    ),
    current_user_id,
    current_user_id
  )
  returning * into new_case;

  insert into public.case_progress_logs (
    case_id,
    from_status,
    to_status,
    notes,
    changed_by_user_id,
    changed_by_associate_id
  )
  values (
    new_case.id,
    null,
    new_case.status,
    'Case created',
    current_user_id,
    public.case_current_associate_id()
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Case created successfully.',
    'data', public.case_to_json(new_case)
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more linked records do not exist.');
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more IDs are invalid.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_create_from_transaction_item(
  target_transaction_item_id uuid,
  payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_item record;
  linked_appointment_id uuid;
  new_case public.cases;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'New');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create cases.');
  end if;

  if not public.case_is_valid_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || requested_status);
  end if;

  select
    ti.id as transaction_item_id,
    ti.transaction_id,
    ti.service_id,
    ti.associate_id,
    t.client_id
  into source_item
  from public.transaction_items ti
  join public.transactions t on t.id = ti.transaction_id
  where ti.id = target_transaction_item_id;

  if source_item.transaction_item_id is null then
    return jsonb_build_object('success', false, 'message', 'Transaction item was not found.');
  end if;

  select id
  into linked_appointment_id
  from public.appointments
  where transaction_item_id = target_transaction_item_id
  order by created_at desc
  limit 1;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    appointment_id,
    associate_id,
    case_type,
    status,
    priority,
    presenting_concern,
    internal_notes,
    report_due_date,
    target_release_date,
    created_by_user_id,
    updated_by_user_id
  )
  values (
    nullif(payload->>'case_number', ''),
    source_item.client_id,
    coalesce(nullif(payload->>'service_id', '')::uuid, source_item.service_id),
    source_item.transaction_id,
    source_item.transaction_item_id,
    coalesce(nullif(payload->>'appointment_id', '')::uuid, linked_appointment_id),
    coalesce(nullif(payload->>'associate_id', '')::uuid, source_item.associate_id),
    coalesce(nullif(payload->>'case_type', ''), 'Assessment'),
    requested_status,
    coalesce(nullif(payload->>'priority', ''), 'Normal'),
    nullif(payload->>'presenting_concern', ''),
    nullif(payload->>'internal_notes', ''),
    nullif(payload->>'report_due_date', '')::date,
    coalesce(
      nullif(payload->>'target_release_date', '')::date,
      nullif(payload->>'report_due_date', '')::date
    ),
    current_user_id,
    current_user_id
  )
  returning * into new_case;

  insert into public.case_progress_logs (
    case_id,
    from_status,
    to_status,
    notes,
    changed_by_user_id,
    changed_by_associate_id
  )
  values (
    new_case.id,
    null,
    new_case.status,
    'Case created from transaction item',
    current_user_id,
    public.case_current_associate_id()
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Case created from transaction item successfully.',
    'data', public.case_to_json(new_case)
  );
exception
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more linked records do not exist.');
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Case could not be created because one or more IDs are invalid.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_list_all()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_client(target_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Client cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.client_id = target_client_id
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_associate(target_associate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  if not public.case_can_access_associate(target_associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases assigned to this associate.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Associate cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.associate_id = target_associate_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_by_status(target_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  if not public.case_is_valid_status(target_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || coalesce(target_status, ''));
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Cases loaded by status successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.created_at desc)
      from public.cases c
      where c.status = target_status
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_list_overdue(target_date date default ((now() at time zone 'Asia/Manila')::date))
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view cases.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Overdue cases loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_to_json(c) order by c.target_release_date asc, c.created_at desc)
      from public.cases c
      where c.target_release_date is not null
        and c.target_release_date < target_date
        and c.status not in ('Released', 'Closed', 'Cancelled')
        and public.case_can_access_associate(c.associate_id)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_update_status(
  target_case_id uuid,
  new_status text,
  status_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  previous_case public.cases;
  updated_case public.cases;
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update case status.');
  end if;

  if not public.case_is_valid_status(new_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid case status: ' || coalesce(new_status, ''));
  end if;

  select *
  into previous_case
  from public.cases
  where id = target_case_id;

  if previous_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  update public.cases
  set
    status = new_status,
    updated_by_user_id = current_user_id,
    released_at = case when new_status = 'Released' then coalesce(released_at, now()) else released_at end,
    closed_at = case when new_status in ('Closed', 'Cancelled') then coalesce(closed_at, now()) else closed_at end
  where id = target_case_id
  returning * into updated_case;

  if previous_case.status is distinct from new_status and nullif(status_notes, '') is not null then
    update public.case_progress_logs
    set notes = status_notes
    where id = (
      select id
      from public.case_progress_logs
      where case_id = target_case_id
        and from_status = previous_case.status
        and to_status = new_status
      order by created_at desc
      limit 1
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case status updated successfully.',
    'data', public.case_to_json(updated_case)
  );
exception
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_assign_associate(
  target_case_id uuid,
  target_associate_id uuid,
  assignment_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  updated_case public.cases;
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to assign associates to cases.');
  end if;

  if target_associate_id is not null and not exists (
    select 1
    from public.mental_health_associates
    where id = target_associate_id
      and is_active = true
  ) then
    return jsonb_build_object('success', false, 'message', 'Associate was not found or is inactive.');
  end if;

  update public.cases
  set
    associate_id = target_associate_id,
    updated_by_user_id = public.case_current_user_id()
  where id = target_case_id
  returning * into updated_case;

  if updated_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  if nullif(assignment_note, '') is not null then
    insert into public.case_progress_logs (
      case_id,
      from_status,
      to_status,
      notes,
      changed_by_user_id,
      changed_by_associate_id
    )
    values (
      updated_case.id,
      updated_case.status,
      updated_case.status,
      assignment_note,
      public.case_current_user_id(),
      public.case_current_associate_id()
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Associate assigned successfully.',
    'data', public.case_to_json(updated_case)
  );
end;
$$;

create or replace function public.case_add_progress_note(
  target_case_id uuid,
  progress_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_case public.cases;
  inserted_log public.case_progress_logs;
begin
  if not public.case_can_add_progress(target_case_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to add progress notes for this case.');
  end if;

  if progress_note is null or length(trim(progress_note)) = 0 then
    return jsonb_build_object('success', false, 'message', 'Progress note is required.');
  end if;

  select *
  into target_case
  from public.cases
  where id = target_case_id;

  if target_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  insert into public.case_progress_logs (
    case_id,
    from_status,
    to_status,
    notes,
    changed_by_user_id,
    changed_by_associate_id
  )
  values (
    target_case.id,
    target_case.status,
    target_case.status,
    trim(progress_note),
    public.case_current_user_id(),
    public.case_current_associate_id()
  )
  returning * into inserted_log;

  return jsonb_build_object(
    'success', true,
    'message', 'Progress note added successfully.',
    'data', to_jsonb(inserted_log)
  );
end;
$$;

create or replace function public.case_list_progress_logs(target_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_case public.cases;
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view case progress.');
  end if;

  select *
  into target_case
  from public.cases
  where id = target_case_id;

  if target_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  if not public.case_can_access_associate(target_case.associate_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view progress for this case.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case progress loaded successfully.',
    'data', coalesce((
      select jsonb_agg(to_jsonb(logs) order by logs.created_at desc)
      from public.case_progress_logs logs
      where logs.case_id = target_case_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_task_create(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  parent_case public.cases;
  new_task public.case_tasks;
  requested_status text := coalesce(nullif(payload->>'status', ''), 'Pending');
  current_user_id uuid := public.case_current_user_id();
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to create case tasks.');
  end if;

  if payload->>'case_id' is null or payload->>'case_id' = '' then
    return jsonb_build_object('success', false, 'message', 'Case is required to create a task.');
  end if;

  if not public.case_is_valid_task_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid task status: ' || requested_status);
  end if;

  if payload->>'title' is null or length(trim(payload->>'title')) = 0 then
    return jsonb_build_object('success', false, 'message', 'Task title is required.');
  end if;

  select *
  into parent_case
  from public.cases
  where id = (payload->>'case_id')::uuid;

  if parent_case.id is null then
    return jsonb_build_object('success', false, 'message', 'Case was not found.');
  end if;

  insert into public.case_tasks (
    case_id,
    title,
    description,
    status,
    assigned_to_user_id,
    assigned_to_associate_id,
    due_date,
    completed_at,
    created_by_user_id
  )
  values (
    parent_case.id,
    trim(payload->>'title'),
    nullif(payload->>'description', ''),
    requested_status,
    nullif(payload->>'assigned_to_user_id', '')::uuid,
    nullif(payload->>'assigned_to_associate_id', '')::uuid,
    nullif(payload->>'due_date', '')::date,
    case when requested_status = 'Completed' then now() else null end,
    current_user_id
  )
  returning * into new_task;

  return jsonb_build_object(
    'success', true,
    'message', 'Case task created successfully.',
    'data', public.case_task_to_json(new_task)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Task could not be created because one or more IDs are invalid.');
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Task could not be created because one or more linked records do not exist.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

create or replace function public.case_task_update(
  target_task_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  existing_task public.case_tasks;
  updated_task public.case_tasks;
  requested_status text;
begin
  if not public.case_can_update_task(target_task_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to update this case task.');
  end if;

  select *
  into existing_task
  from public.case_tasks
  where id = target_task_id;

  if existing_task.id is null then
    return jsonb_build_object('success', false, 'message', 'Case task was not found.');
  end if;

  requested_status := coalesce(nullif(payload->>'status', ''), existing_task.status);

  if not public.case_is_valid_task_status(requested_status) then
    return jsonb_build_object('success', false, 'message', 'Invalid task status: ' || requested_status);
  end if;

  update public.case_tasks
  set
    title = coalesce(nullif(payload->>'title', ''), title),
    description = case
      when payload ? 'description' then nullif(payload->>'description', '')
      else description
    end,
    status = requested_status,
    assigned_to_user_id = case
      when payload ? 'assigned_to_user_id' and public.case_can_manage_cases() then nullif(payload->>'assigned_to_user_id', '')::uuid
      else assigned_to_user_id
    end,
    assigned_to_associate_id = case
      when payload ? 'assigned_to_associate_id' and public.case_can_manage_cases() then nullif(payload->>'assigned_to_associate_id', '')::uuid
      else assigned_to_associate_id
    end,
    due_date = case
      when payload ? 'due_date' and public.case_can_manage_cases() then nullif(payload->>'due_date', '')::date
      else due_date
    end,
    completed_at = case
      when requested_status = 'Completed' then coalesce(completed_at, now())
      when existing_task.status = 'Completed' and requested_status <> 'Completed' then null
      else completed_at
    end
  where id = target_task_id
  returning * into updated_task;

  return jsonb_build_object(
    'success', true,
    'message', 'Case task updated successfully.',
    'data', public.case_task_to_json(updated_task)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'Task could not be updated because one or more IDs are invalid.');
  when foreign_key_violation then
    return jsonb_build_object('success', false, 'message', 'Task could not be updated because one or more linked records do not exist.');
  when others then
    return jsonb_build_object('success', false, 'message', SQLERRM);
end;
$$;

drop policy if exists cases_select_scheduling_users on public.cases;
drop policy if exists cases_insert_scheduling_users on public.cases;
drop policy if exists cases_update_scheduling_users on public.cases;
drop policy if exists cases_delete_admin_users on public.cases;
drop policy if exists cases_select_case_users on public.cases;
drop policy if exists cases_insert_case_managers on public.cases;
drop policy if exists cases_update_case_managers on public.cases;

create policy cases_select_case_users
on public.cases
for select
to authenticated
using (
  public.case_can_use_module()
  and public.case_can_access_associate(associate_id)
);

create policy cases_insert_case_managers
on public.cases
for insert
to authenticated
with check (public.case_can_manage_cases());

create policy cases_update_case_managers
on public.cases
for update
to authenticated
using (public.case_can_manage_cases())
with check (public.case_can_manage_cases());

create policy cases_delete_admin_users
on public.cases
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists case_progress_logs_select_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_insert_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_update_scheduling_users on public.case_progress_logs;
drop policy if exists case_progress_logs_delete_admin_users on public.case_progress_logs;
drop policy if exists case_progress_logs_select_case_users on public.case_progress_logs;
drop policy if exists case_progress_logs_insert_case_contributors on public.case_progress_logs;
drop policy if exists case_progress_logs_update_case_managers on public.case_progress_logs;

create policy case_progress_logs_select_case_users
on public.case_progress_logs
for select
to authenticated
using (
  public.case_can_use_module()
  and exists (
    select 1
    from public.cases c
    where c.id = case_progress_logs.case_id
      and public.case_can_access_associate(c.associate_id)
  )
);

create policy case_progress_logs_insert_case_contributors
on public.case_progress_logs
for insert
to authenticated
with check (public.case_can_add_progress(case_id));

create policy case_progress_logs_update_case_managers
on public.case_progress_logs
for update
to authenticated
using (public.case_can_manage_cases())
with check (public.case_can_manage_cases());

create policy case_progress_logs_delete_admin_users
on public.case_progress_logs
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists case_tasks_select_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_insert_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_update_scheduling_users on public.case_tasks;
drop policy if exists case_tasks_delete_admin_users on public.case_tasks;
drop policy if exists case_tasks_select_case_users on public.case_tasks;
drop policy if exists case_tasks_insert_case_managers on public.case_tasks;
drop policy if exists case_tasks_update_case_contributors on public.case_tasks;

create policy case_tasks_select_case_users
on public.case_tasks
for select
to authenticated
using (
  public.case_can_use_module()
  and exists (
    select 1
    from public.cases c
    where c.id = case_tasks.case_id
      and public.case_can_access_associate(c.associate_id)
  )
);

create policy case_tasks_insert_case_managers
on public.case_tasks
for insert
to authenticated
with check (public.case_can_manage_cases());

create policy case_tasks_update_case_contributors
on public.case_tasks
for update
to authenticated
using (public.case_can_update_task(id))
with check (public.case_can_update_task(id));

create policy case_tasks_delete_admin_users
on public.case_tasks
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

grant execute on function public.case_add_progress_note(uuid, text) to authenticated;
grant execute on function public.case_list_progress_logs(uuid) to authenticated;
grant execute on function public.case_assign_associate(uuid, uuid, text) to authenticated;

-- ============================================================================
-- INCLUDED SOURCE: database/11_add_case_ui_support.sql
-- ============================================================================
-- UI support RPCs for Case Management.
-- Run after database/10_add_case_role_access.sql.

create or replace function public.case_can_view_payment_status()
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.case_current_role(), '') in (
    'admin',
    'manager',
    'case_staff'
  );
$$;

create or replace function public.case_to_json(case_row public.cases)
returns jsonb
language sql
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'id', case_row.id,
    'case_number', case_row.case_number,
    'client_id', case_row.client_id,
    'client_name', (select full_name from public.clients where id = case_row.client_id),
    'client', (
      select jsonb_build_object(
        'id', c.id,
        'client_code', c.client_code,
        'full_name', c.full_name,
        'contact_number', c.contact_number,
        'email', c.email,
        'sex', c.sex,
        'age', c.age
      )
      from public.clients c
      where c.id = case_row.client_id
    ),
    'service_id', case_row.service_id,
    'service_name', (select name from public.services where id = case_row.service_id),
    'transaction_id', case_row.transaction_id,
    'transaction_number', (
      select transaction_number
      from public.transactions
      where id = case_row.transaction_id
    ),
    'payment_status', case
      when public.case_can_view_payment_status() then (
        select payment_status
        from public.transactions
        where id = case_row.transaction_id
      )
      else null
    end,
    'transaction_item_id', case_row.transaction_item_id,
    'appointment_id', case_row.appointment_id,
    'associate_id', case_row.associate_id,
    'associate_name', (
      select full_name
      from public.mental_health_associates
      where id = case_row.associate_id
    ),
    'case_type', case_row.case_type,
    'status', case_row.status,
    'report_status', case_row.status,
    'priority', case_row.priority,
    'presenting_concern', case_row.presenting_concern,
    'internal_notes', case_row.internal_notes,
    'report_due_date', case_row.report_due_date,
    'target_release_date', case_row.target_release_date,
    'released_at', case_row.released_at,
    'closed_at', case_row.closed_at,
    'created_by_user_id', case_row.created_by_user_id,
    'updated_by_user_id', case_row.updated_by_user_id,
    'created_at', case_row.created_at,
    'updated_at', case_row.updated_at
  );
$$;

create or replace function public.case_list_tasks(target_case_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view case tasks.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case tasks loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_task_to_json(t) order by t.due_date nulls last, t.created_at desc)
      from public.case_tasks t
      join public.cases c on c.id = t.case_id
      where (target_case_id is null or t.case_id = target_case_id)
        and public.case_can_access_associate(c.associate_id)
        and (
          coalesce(public.case_current_role(), '') <> 'associate_user'
          or t.assigned_to_associate_id = public.case_current_associate_id()
          or c.associate_id = public.case_current_associate_id()
        )
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_form_options()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to load case form options.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case form options loaded successfully.',
    'data', jsonb_build_object(
      'clients', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'client_code', c.client_code,
          'full_name', c.full_name,
          'contact_number', c.contact_number,
          'email', c.email
        ) order by c.full_name)
        from public.clients c
      ), '[]'::jsonb),
      'services', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'category', s.category
        ) order by s.name)
        from public.services s
        where s.is_active = true
      ), '[]'::jsonb),
      'associates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'full_name', a.full_name,
          'title', a.title,
          'profession', a.profession
        ) order by a.full_name)
        from public.mental_health_associates a
        where a.is_active = true
      ), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.case_can_view_payment_status() to authenticated;
grant execute on function public.case_list_tasks(uuid) to authenticated;
grant execute on function public.case_form_options() to authenticated;

-- ============================================================================
-- INCLUDED SOURCE: database/12_connect_cases_to_pos_transactions.sql
-- ============================================================================
-- Connect Case Management to POS transaction items.
-- Run after database/11_add_case_ui_support.sql.

alter table public.services
  add column if not exists requires_case_management boolean not null default false;

create index if not exists services_requires_case_management_idx
  on public.services (requires_case_management)
  where requires_case_management = true;

alter table public.cases
  add column if not exists report_status text not null default 'Not Started';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cases_report_status_check'
      and conrelid = 'public.cases'::regclass
  ) then
    alter table public.cases
      add constraint cases_report_status_check
      check (
        report_status in (
          'Not Started',
          'In Progress',
          'For Review',
          'For Revision',
          'Ready for Release',
          'Released',
          'Cancelled'
        )
      );
  end if;
end $$;

create index if not exists cases_report_status_idx
  on public.cases (report_status);

create unique index if not exists cases_transaction_item_unique_idx
  on public.cases (transaction_item_id)
  where transaction_item_id is not null;

create or replace function public.case_to_json(case_row public.cases)
returns jsonb
language sql
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'id', case_row.id,
    'case_number', case_row.case_number,
    'client_id', case_row.client_id,
    'client_name', (select full_name from public.clients where id = case_row.client_id),
    'client', (
      select jsonb_build_object(
        'id', c.id,
        'client_code', c.client_code,
        'full_name', c.full_name,
        'contact_number', c.contact_number,
        'email', c.email,
        'sex', c.sex,
        'age', c.age
      )
      from public.clients c
      where c.id = case_row.client_id
    ),
    'service_id', case_row.service_id,
    'service_name', (select name from public.services where id = case_row.service_id),
    'transaction_id', case_row.transaction_id,
    'transaction_number', (
      select transaction_number
      from public.transactions
      where id = case_row.transaction_id
    ),
    'payment_status', case
      when public.case_can_view_payment_status() then (
        select payment_status
        from public.transactions
        where id = case_row.transaction_id
      )
      else null
    end,
    'transaction_item_id', case_row.transaction_item_id,
    'appointment_id', case_row.appointment_id,
    'associate_id', case_row.associate_id,
    'associate_name', (
      select full_name
      from public.mental_health_associates
      where id = case_row.associate_id
    ),
    'case_type', case_row.case_type,
    'status', case_row.status,
    'report_status', case_row.report_status,
    'priority', case_row.priority,
    'presenting_concern', case_row.presenting_concern,
    'internal_notes', case_row.internal_notes,
    'report_due_date', case_row.report_due_date,
    'target_release_date', case_row.target_release_date,
    'released_at', case_row.released_at,
    'closed_at', case_row.closed_at,
    'created_by_user_id', case_row.created_by_user_id,
    'updated_by_user_id', case_row.updated_by_user_id,
    'created_at', case_row.created_at,
    'updated_at', case_row.updated_at
  );
$$;

create or replace function public.create_case_from_transaction_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_transaction public.transactions;
  source_service public.services;
  release_target date;
  created_case public.cases;
begin
  if new.service_id is null then
    return new;
  end if;

  select *
  into source_service
  from public.services
  where id = new.service_id;

  if not coalesce(source_service.requires_case_management, false) then
    return new;
  end if;

  if exists (
    select 1
    from public.cases
    where transaction_item_id = new.id
  ) then
    return new;
  end if;

  select *
  into source_transaction
  from public.transactions
  where id = new.transaction_id;

  if source_transaction.id is null or source_transaction.client_id is null then
    return new;
  end if;

  release_target := case
    when lower(coalesce(source_service.category, '')) = 'assessment' then
      ((source_transaction.transaction_date at time zone 'Asia/Manila')::date + 30)
    else null
  end;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    associate_id,
    case_type,
    status,
    report_status,
    priority,
    target_release_date,
    report_due_date,
    presenting_concern,
    internal_notes
  )
  values (
    null,
    source_transaction.client_id,
    new.service_id,
    new.transaction_id,
    new.id,
    new.associate_id,
    coalesce(nullif(source_service.category, ''), 'Assessment'),
    'New',
    'Not Started',
    'Normal',
    release_target,
    release_target,
    null,
    'Automatically created from POS transaction item.'
  )
  on conflict (transaction_item_id) where transaction_item_id is not null do nothing
  returning * into created_case;

  if created_case.id is not null then
    insert into public.case_progress_logs (
      case_id,
      from_status,
      to_status,
      notes
    )
    values (
      created_case.id,
      null,
      'New',
      'Case automatically created from POS transaction item.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transaction_items_create_case
on public.transaction_items;

create trigger trg_transaction_items_create_case
after insert on public.transaction_items
for each row
execute function public.create_case_from_transaction_item_trigger();

-- Make the installed Case Management RPCs immediately visible to PostgREST.
notify pgrst, 'reload schema';

-- ============================================================================
-- INCLUDED SOURCE: database/18_add_configurable_case_workflow.sql
-- ============================================================================
-- Configurable groups and columns for the Case Management Kanban board.
-- Run after database/12_connect_cases_to_pos_transactions.sql.

create table if not exists public.case_workflow_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#0f9d91',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_workflow_columns (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.case_workflow_groups(id) on delete set null,
  status_key text not null unique,
  name text not null,
  color text not null default '#0f9d91',
  sort_order integer not null default 0,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(status_key)) > 0),
  check (length(trim(name)) > 0)
);

drop trigger if exists trg_case_workflow_groups_set_updated_at
on public.case_workflow_groups;
create trigger trg_case_workflow_groups_set_updated_at
before update on public.case_workflow_groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_case_workflow_columns_set_updated_at
on public.case_workflow_columns;
create trigger trg_case_workflow_columns_set_updated_at
before update on public.case_workflow_columns
for each row execute function public.set_updated_at();

insert into public.case_workflow_groups (id, name, color, sort_order)
values
  ('10000000-0000-0000-0000-000000000001', 'Intake & Scheduling', '#0ea5e9', 10),
  ('10000000-0000-0000-0000-000000000002', 'Assessment', '#8b5cf6', 20),
  ('10000000-0000-0000-0000-000000000003', 'Reporting', '#f59e0b', 30),
  ('10000000-0000-0000-0000-000000000004', 'Release & Closure', '#10b981', 40)
on conflict (name) do nothing;

insert into public.case_workflow_columns (
  group_id, status_key, name, color, sort_order, is_terminal
)
values
  ('10000000-0000-0000-0000-000000000001', 'New', 'New', '#0ea5e9', 10, false),
  ('10000000-0000-0000-0000-000000000001', 'Scheduled', 'Scheduled', '#6366f1', 20, false),
  ('10000000-0000-0000-0000-000000000002', 'Testing Ongoing', 'Testing Ongoing', '#8b5cf6', 10, false),
  ('10000000-0000-0000-0000-000000000002', 'Testing Completed', 'Testing Completed', '#a855f7', 20, false),
  ('10000000-0000-0000-0000-000000000002', 'Scoring', 'Scoring', '#d946ef', 30, false),
  ('10000000-0000-0000-0000-000000000002', 'Interpretation', 'Interpretation', '#06b6d4', 40, false),
  ('10000000-0000-0000-0000-000000000003', 'Report Writing', 'Report Writing', '#3b82f6', 10, false),
  ('10000000-0000-0000-0000-000000000003', 'For Review', 'For Review', '#f59e0b', 20, false),
  ('10000000-0000-0000-0000-000000000003', 'For Revision', 'For Revision', '#f97316', 30, false),
  ('10000000-0000-0000-0000-000000000004', 'Ready for Release', 'Ready for Release', '#10b981', 10, false),
  ('10000000-0000-0000-0000-000000000004', 'Released', 'Released', '#14b8a6', 20, true),
  ('10000000-0000-0000-0000-000000000004', 'Closed', 'Closed', '#64748b', 30, true),
  ('10000000-0000-0000-0000-000000000004', 'Cancelled', 'Cancelled', '#f43f5e', 40, true)
on conflict (status_key) do update
set
  name = excluded.name,
  color = excluded.color,
  group_id = coalesce(case_workflow_columns.group_id, excluded.group_id);

alter table public.cases
  drop constraint if exists cases_status_check;
alter table public.case_progress_logs
  drop constraint if exists case_progress_logs_from_status_check;
alter table public.case_progress_logs
  drop constraint if exists case_progress_logs_to_status_check;

create or replace function public.case_status_values()
returns text[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    array_agg(status_key order by sort_order, name),
    array[]::text[]
  )
  from public.case_workflow_columns
  where is_active = true;
$$;

create or replace function public.case_is_valid_status(status_value text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.case_workflow_columns
    where status_key = status_value
      and is_active = true
  );
$$;

create or replace function public.case_workflow_list()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view the case workflow.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case workflow loaded.',
    'data', jsonb_build_object(
      'groups', coalesce((
        select jsonb_agg(to_jsonb(g) order by g.sort_order, g.name)
        from public.case_workflow_groups g
        where g.is_active = true
      ), '[]'::jsonb),
      'columns', coalesce((
        select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name)
        from public.case_workflow_columns c
        where c.is_active = true
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.case_workflow_create_group(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_group public.case_workflow_groups;
begin
  if not public.case_is_privileged_user() then
    return jsonb_build_object('success', false, 'message', 'Only administrators and managers can configure workflows.');
  end if;
  if length(trim(coalesce(payload->>'name', ''))) = 0 then
    return jsonb_build_object('success', false, 'message', 'Group name is required.');
  end if;

  insert into public.case_workflow_groups (name, color, sort_order)
  values (
    trim(payload->>'name'),
    coalesce(nullif(payload->>'color', ''), '#0f9d91'),
    coalesce((payload->>'sort_order')::integer, (select coalesce(max(sort_order), 0) + 10 from public.case_workflow_groups))
  )
  returning * into created_group;

  return jsonb_build_object('success', true, 'message', 'Workflow group created.', 'data', to_jsonb(created_group));
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'message', 'A workflow group with this name already exists.');
end;
$$;

create or replace function public.case_workflow_create_column(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_column public.case_workflow_columns;
  generated_key text;
begin
  if not public.case_is_privileged_user() then
    return jsonb_build_object('success', false, 'message', 'Only administrators and managers can configure workflows.');
  end if;
  if length(trim(coalesce(payload->>'name', ''))) = 0 then
    return jsonb_build_object('success', false, 'message', 'Column name is required.');
  end if;

  generated_key := lower(regexp_replace(trim(payload->>'name'), '[^a-zA-Z0-9]+', '-', 'g'));
  generated_key := trim(both '-' from generated_key);
  if generated_key = '' then
    generated_key := 'status';
  end if;
  if exists (select 1 from public.case_workflow_columns where status_key = generated_key) then
    generated_key := generated_key || '-' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  insert into public.case_workflow_columns (
    group_id, status_key, name, color, sort_order, is_terminal
  )
  values (
    nullif(payload->>'group_id', '')::uuid,
    generated_key,
    trim(payload->>'name'),
    coalesce(nullif(payload->>'color', ''), '#0f9d91'),
    coalesce(
      (payload->>'sort_order')::integer,
      (select coalesce(max(sort_order), 0) + 10 from public.case_workflow_columns where group_id is not distinct from nullif(payload->>'group_id', '')::uuid)
    ),
    coalesce((payload->>'is_terminal')::boolean, false)
  )
  returning * into created_column;

  return jsonb_build_object('success', true, 'message', 'Workflow column created.', 'data', to_jsonb(created_column));
exception
  when invalid_text_representation then
    return jsonb_build_object('success', false, 'message', 'The selected workflow group is invalid.');
end;
$$;

alter table public.case_workflow_groups enable row level security;
alter table public.case_workflow_columns enable row level security;

drop policy if exists case_workflow_groups_select_users on public.case_workflow_groups;
create policy case_workflow_groups_select_users
on public.case_workflow_groups for select to authenticated
using (public.case_can_use_module());

drop policy if exists case_workflow_groups_manage_privileged on public.case_workflow_groups;
create policy case_workflow_groups_manage_privileged
on public.case_workflow_groups for all to authenticated
using (public.case_is_privileged_user())
with check (public.case_is_privileged_user());

drop policy if exists case_workflow_columns_select_users on public.case_workflow_columns;
create policy case_workflow_columns_select_users
on public.case_workflow_columns for select to authenticated
using (public.case_can_use_module());

drop policy if exists case_workflow_columns_manage_privileged on public.case_workflow_columns;
create policy case_workflow_columns_manage_privileged
on public.case_workflow_columns for all to authenticated
using (public.case_is_privileged_user())
with check (public.case_is_privileged_user());

grant select, insert, update, delete on public.case_workflow_groups to authenticated;
grant select, insert, update, delete on public.case_workflow_columns to authenticated;
grant execute on function public.case_workflow_list() to authenticated;
grant execute on function public.case_workflow_create_group(jsonb) to authenticated;
grant execute on function public.case_workflow_create_column(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- INCLUDED SOURCE: database/19_add_case_workflow_reordering.sql
-- ============================================================================

-- Persist drag-and-drop ordering for Case Management workflow groups and columns.
-- Run after database/18_add_configurable_case_workflow.sql.

create or replace function public.case_workflow_reorder(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  group_item jsonb;
  column_item jsonb;
  target_group_id uuid;
begin
  if not public.case_is_privileged_user() then
    return jsonb_build_object(
      'success', false,
      'message', 'Only administrators and managers can reorder workflows.'
    );
  end if;

  for group_item in
    select value
    from jsonb_array_elements(coalesce(payload->'groups', '[]'::jsonb))
  loop
    update public.case_workflow_groups
    set sort_order = (group_item->>'sort_order')::integer
    where id = (group_item->>'id')::uuid;

    if not found then
      raise exception 'Workflow group was not found.';
    end if;
  end loop;

  for column_item in
    select value
    from jsonb_array_elements(coalesce(payload->'columns', '[]'::jsonb))
  loop
    target_group_id := nullif(column_item->>'group_id', '')::uuid;

    if target_group_id is not null and not exists (
      select 1
      from public.case_workflow_groups
      where id = target_group_id
        and is_active = true
    ) then
      raise exception 'The selected workflow group was not found.';
    end if;

    update public.case_workflow_columns
    set
      group_id = target_group_id,
      sort_order = (column_item->>'sort_order')::integer
    where id = (column_item->>'id')::uuid;

    if not found then
      raise exception 'Workflow column was not found.';
    end if;
  end loop;

  return public.case_workflow_list();
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object(
      'success', false,
      'message', 'The workflow ordering request contains invalid values.'
    );
  when others then
    return jsonb_build_object(
      'success', false,
      'message', sqlerrm
    );
end;
$$;

revoke all on function public.case_workflow_reorder(jsonb) from public;
grant execute on function public.case_workflow_reorder(jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- INCLUDED SOURCE: database/20_route_pos_cases_to_main_new.sql
-- ============================================================================

-- Route automatically created POS cases to MAIN_START / MAIN_NEW.
-- Run after database/19_add_case_workflow_reordering.sql.

create or replace function public.create_case_from_transaction_item_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  source_transaction public.transactions;
  source_service public.services;
  release_target date;
  initial_status text;
  created_case public.cases;
begin
  if new.service_id is null then
    return new;
  end if;

  select *
  into source_service
  from public.services
  where id = new.service_id;

  if not coalesce(source_service.requires_case_management, false) then
    return new;
  end if;

  if exists (
    select 1
    from public.cases
    where transaction_item_id = new.id
  ) then
    return new;
  end if;

  select *
  into source_transaction
  from public.transactions
  where id = new.transaction_id;

  if source_transaction.id is null or source_transaction.client_id is null then
    return new;
  end if;

  -- Prefer the clinic's configured starting column. If it has been renamed or
  -- disabled, use New, then the first active workflow column as a safe fallback.
  select workflow_column.status_key
  into initial_status
  from public.case_workflow_columns workflow_column
  left join public.case_workflow_groups workflow_group
    on workflow_group.id = workflow_column.group_id
  where workflow_column.is_active = true
    and (
      workflow_group.id is null
      or workflow_group.is_active = true
    )
  order by
    case
      when lower(trim(coalesce(workflow_group.name, ''))) = 'main_start'
        and lower(trim(workflow_column.name)) = 'main_new'
        then 0
      when workflow_column.status_key = 'New'
        or lower(trim(workflow_column.name)) = 'new'
        then 1
      else 2
    end,
    workflow_group.sort_order nulls last,
    workflow_column.sort_order,
    workflow_column.name
  limit 1;

  initial_status := coalesce(initial_status, 'New');

  release_target := case
    when lower(coalesce(source_service.category, '')) = 'assessment' then
      ((source_transaction.transaction_date at time zone 'Asia/Manila')::date + 30)
    else null
  end;

  insert into public.cases (
    case_number,
    client_id,
    service_id,
    transaction_id,
    transaction_item_id,
    associate_id,
    case_type,
    status,
    report_status,
    priority,
    target_release_date,
    report_due_date,
    presenting_concern,
    internal_notes
  )
  values (
    null,
    source_transaction.client_id,
    new.service_id,
    new.transaction_id,
    new.id,
    new.associate_id,
    coalesce(nullif(source_service.category, ''), 'Assessment'),
    initial_status,
    'Not Started',
    'Normal',
    release_target,
    release_target,
    null,
    'Automatically created from POS transaction item.'
  )
  on conflict (transaction_item_id) where transaction_item_id is not null do nothing
  returning * into created_case;

  if created_case.id is not null then
    insert into public.case_progress_logs (
      case_id,
      from_status,
      to_status,
      notes
    )
    values (
      created_case.id,
      null,
      initial_status,
      'Case automatically created from POS transaction item.'
    );
  end if;

  return new;
end;
$$;

-- Repair the trigger as well as the function. Existing projects may have the
-- function installed while the transaction-item trigger is missing.
drop trigger if exists trg_transaction_items_create_case
on public.transaction_items;

create trigger trg_transaction_items_create_case
after insert on public.transaction_items
for each row
execute function public.create_case_from_transaction_item_trigger();

notify pgrst, 'reload schema';

-- INCLUDED SOURCE: database/21_add_case_document_attachments.sql

-- Private case document storage and metadata.
-- Run after database/20_route_pos_cases_to_main_new.sql.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'case-documents',
  'case-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size bigint not null default 0,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists case_documents_case_idx
  on public.case_documents (case_id, created_at desc);

alter table public.case_documents enable row level security;

create or replace function public.case_can_view_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target_case_id
      and public.case_can_access_associate(c.associate_id)
  );
$$;

create or replace function public.case_document_to_json(document_row public.case_documents)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', document_row.id,
    'case_id', document_row.case_id,
    'file_name', document_row.file_name,
    'file_path', document_row.file_path,
    'mime_type', document_row.mime_type,
    'file_size', document_row.file_size,
    'uploaded_by_user_id', document_row.uploaded_by_user_id,
    'created_at', document_row.created_at
  );
$$;

create or replace function public.case_document_create(
  target_case_id uuid,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  new_document public.case_documents;
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to add case documents.');
  end if;

  if not public.case_can_view_case(target_case_id) then
    return jsonb_build_object('success', false, 'message', 'Case was not found or cannot be accessed.');
  end if;

  if lower(coalesce(mime_type, '')) not in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ) then
    return jsonb_build_object('success', false, 'message', 'Only PDF, DOC, DOCX, and text files are allowed.');
  end if;

  if nullif(trim(coalesce(file_name, '')), '') is null
    or nullif(trim(coalesce(file_path, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Document file name and storage path are required.');
  end if;

  insert into public.case_documents (
    case_id,
    file_name,
    file_path,
    mime_type,
    file_size,
    uploaded_by_user_id
  )
  values (
    target_case_id,
    trim(file_name),
    trim(file_path),
    lower(mime_type),
    greatest(coalesce(file_size, 0), 0),
    public.case_current_user_id()
  )
  returning * into new_document;

  return jsonb_build_object(
    'success', true,
    'message', 'Case document added successfully.',
    'data', public.case_document_to_json(new_document)
  );
end;
$$;

create or replace function public.case_document_list(target_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view case documents.');
  end if;

  if not public.case_can_view_case(target_case_id) then
    return jsonb_build_object('success', false, 'message', 'Case was not found or cannot be accessed.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case documents loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_document_to_json(doc) order by doc.created_at desc)
      from public.case_documents doc
      where doc.case_id = target_case_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_document_delete(target_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.case_documents;
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to delete case documents.');
  end if;

  select *
  into target_document
  from public.case_documents
  where id = target_document_id;

  if target_document.id is null then
    return jsonb_build_object('success', false, 'message', 'Case document was not found.');
  end if;

  if not public.case_can_view_case(target_document.case_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to delete this case document.');
  end if;

  delete from public.case_documents
  where id = target_document_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Case document deleted successfully.',
    'data', public.case_document_to_json(target_document)
  );
end;
$$;

drop policy if exists case_documents_select_case_users on public.case_documents;
create policy case_documents_select_case_users
on public.case_documents
for select
to authenticated
using (public.case_can_view_case(case_id));

drop policy if exists case_documents_insert_case_managers on public.case_documents;
create policy case_documents_insert_case_managers
on public.case_documents
for insert
to authenticated
with check (public.case_can_manage_cases() and public.case_can_view_case(case_id));

drop policy if exists case_documents_delete_case_managers on public.case_documents;
create policy case_documents_delete_case_managers
on public.case_documents
for delete
to authenticated
using (public.case_can_manage_cases() and public.case_can_view_case(case_id));

drop policy if exists case_documents_storage_select on storage.objects;
create policy case_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'case-documents'
  and exists (
    select 1
    from public.case_documents doc
    where doc.file_path = storage.objects.name
      and public.case_can_view_case(doc.case_id)
  )
);

drop policy if exists case_documents_storage_insert on storage.objects;
create policy case_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'case-documents'
  and public.case_can_manage_cases()
);

drop policy if exists case_documents_storage_delete on storage.objects;
create policy case_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and public.case_can_manage_cases()
);

grant select, insert, delete on public.case_documents to authenticated;
grant execute on function public.case_can_view_case(uuid) to authenticated;
grant execute on function public.case_document_create(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.case_document_list(uuid) to authenticated;
grant execute on function public.case_document_delete(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- END INCLUDED CASE MANAGEMENT INSTALLER
-- ============================================================================

-- ============================================================================
-- INCLUDED SOURCE: database/23_add_government_transactions.sql
-- ============================================================================
-- Government Transaction Mode database structure.
-- Run after database/22_add_expense_user_role.sql.

create sequence if not exists public.government_transaction_ref_seq;

create table if not exists public.government_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  status text not null default 'referral_received'
    check (status in (
      'referral_received',
      'for_review',
      'costing_prepared',
      'guarantee_letter_received',
      'scheduled',
      'service_completed',
      'soa_submitted',
      'awaiting_cheque',
      'payment_completed'
    )),
  client_name text not null,
  client_contact text not null default '',
  cswd_office text not null default '',
  lgu_name text not null default '',
  social_worker text not null default '',
  referral_date date,
  referral_letter_reference text not null default '',
  selected_tests text not null default '',
  computed_fee numeric not null default 0,
  approved_amount numeric not null default 0,
  endorsement_number text not null default '',
  guarantee_letter_number text not null default '',
  guarantee_letter_date date,
  guarantee_valid_until date,
  schedule_date date,
  service_completed_date date,
  soa_number text not null default '',
  soa_submitted_date date,
  cheque_number text not null default '',
  cheque_released_date date,
  payment_amount numeric not null default 0,
  notes text not null default '',
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists government_transactions_status_idx
  on public.government_transactions (status);

create index if not exists government_transactions_referral_date_idx
  on public.government_transactions (referral_date desc);

create index if not exists government_transactions_lgu_idx
  on public.government_transactions (lgu_name);

create index if not exists government_transactions_gl_idx
  on public.government_transactions (guarantee_letter_number)
  where guarantee_letter_number <> '';

create index if not exists government_transactions_soa_idx
  on public.government_transactions (soa_number)
  where soa_number <> '';

create or replace function public.is_government_transaction_user(auth_id uuid)
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
      and role in ('admin', 'manager', 'regular_user')
      and is_active = true
  );
$$;

create or replace function public.assign_government_transaction_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate_reference text;
begin
  if nullif(trim(coalesce(new.reference_number, '')), '') is not null then
    new.reference_number := upper(trim(new.reference_number));
    return new;
  end if;

  loop
    candidate_reference :=
      'GOV-' ||
      to_char(coalesce(new.created_at, now()) at time zone 'Asia/Manila', 'YYYYMMDD') ||
      '-' ||
      lpad(nextval('public.government_transaction_ref_seq')::text, 4, '0');

    exit when not exists (
      select 1
      from public.government_transactions
      where reference_number = candidate_reference
    );
  end loop;

  new.reference_number := candidate_reference;
  return new;
end;
$$;

drop trigger if exists trg_government_transactions_assign_reference
on public.government_transactions;

create trigger trg_government_transactions_assign_reference
before insert on public.government_transactions
for each row execute function public.assign_government_transaction_reference();

drop trigger if exists trg_government_transactions_set_updated_at
on public.government_transactions;

create trigger trg_government_transactions_set_updated_at
before update on public.government_transactions
for each row execute function public.set_updated_at();

alter table public.government_transactions enable row level security;

drop policy if exists government_transactions_authorized_all
on public.government_transactions;

create policy government_transactions_authorized_all
on public.government_transactions
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_transactions to authenticated;
grant usage, select on sequence public.government_transaction_ref_seq to authenticated;
grant execute on function public.is_government_transaction_user(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- INCLUDED SOURCE: database/24_add_government_transaction_form_support.sql
-- ============================================================================
-- Master data and service rows for Government Transaction Mode forms.
-- Run after database/23_add_government_transactions.sql.

create table if not exists public.government_cswd_offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text not null default '',
  contact_number text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.government_lgu_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text not null default '',
  contact_number text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.government_social_workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cswd_office_id uuid references public.government_cswd_offices(id) on delete set null,
  lgu_agency_id uuid references public.government_lgu_agencies(id) on delete set null,
  contact_number text not null default '',
  email text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (full_name, cswd_office_id, lgu_agency_id)
);

alter table public.government_transactions
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists cswd_office_id uuid references public.government_cswd_offices(id) on delete set null,
  add column if not exists lgu_agency_id uuid references public.government_lgu_agencies(id) on delete set null,
  add column if not exists social_worker_id uuid references public.government_social_workers(id) on delete set null;

create table if not exists public.government_transaction_items (
  id uuid primary key default gen_random_uuid(),
  government_transaction_id uuid not null references public.government_transactions(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists government_cswd_offices_name_idx
  on public.government_cswd_offices (name);

create index if not exists government_lgu_agencies_name_idx
  on public.government_lgu_agencies (name);

create index if not exists government_social_workers_name_idx
  on public.government_social_workers (full_name);

create index if not exists government_transactions_client_idx
  on public.government_transactions (client_id);

create index if not exists government_transactions_cswd_idx
  on public.government_transactions (cswd_office_id);

create index if not exists government_transactions_lgu_agency_idx
  on public.government_transactions (lgu_agency_id);

create index if not exists government_transactions_social_worker_idx
  on public.government_transactions (social_worker_id);

create index if not exists government_transaction_items_transaction_idx
  on public.government_transaction_items (government_transaction_id, sort_order, created_at);

drop trigger if exists trg_government_cswd_offices_set_updated_at
on public.government_cswd_offices;
create trigger trg_government_cswd_offices_set_updated_at
before update on public.government_cswd_offices
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_lgu_agencies_set_updated_at
on public.government_lgu_agencies;
create trigger trg_government_lgu_agencies_set_updated_at
before update on public.government_lgu_agencies
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_social_workers_set_updated_at
on public.government_social_workers;
create trigger trg_government_social_workers_set_updated_at
before update on public.government_social_workers
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_transaction_items_set_updated_at
on public.government_transaction_items;
create trigger trg_government_transaction_items_set_updated_at
before update on public.government_transaction_items
for each row execute function public.set_updated_at();

alter table public.government_cswd_offices enable row level security;
alter table public.government_lgu_agencies enable row level security;
alter table public.government_social_workers enable row level security;
alter table public.government_transaction_items enable row level security;

drop policy if exists government_cswd_offices_authorized_all
on public.government_cswd_offices;
create policy government_cswd_offices_authorized_all
on public.government_cswd_offices
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_lgu_agencies_authorized_all
on public.government_lgu_agencies;
create policy government_lgu_agencies_authorized_all
on public.government_lgu_agencies
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_social_workers_authorized_all
on public.government_social_workers;
create policy government_social_workers_authorized_all
on public.government_social_workers
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_transaction_items_authorized_all
on public.government_transaction_items;
create policy government_transaction_items_authorized_all
on public.government_transaction_items
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_cswd_offices to authenticated;
grant select, insert, update, delete on public.government_lgu_agencies to authenticated;
grant select, insert, update, delete on public.government_social_workers to authenticated;
grant select, insert, update, delete on public.government_transaction_items to authenticated;

notify pgrst, 'reload schema';
