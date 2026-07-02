-- One-time Supabase setup for Psyzygy Clinic POS / NEW_POS.
-- Paste the whole file into the Supabase SQL Editor for a fresh project.
--
-- Default admin login created by this script:
--   Email: admin@psyzygyclinic.com
--   Password: Admin@123456
--
-- After running this script, deploy the Edge Function separately:
--   supabase functions deploy ai-clinic-assistant

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
    check (role in ('admin', 'manager', 'regular_user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_auth_user_id_idx on public.users (auth_user_id);
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
      and role in ('admin', 'manager')
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

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
grant usage, select on sequences to authenticated;
