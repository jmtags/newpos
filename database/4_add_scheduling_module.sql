-- Scheduling module: schedule first, pay later.
-- Run in Supabase SQL Editor after the existing POS schema is in place.

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

create index if not exists rooms_is_active_idx
  on public.rooms (is_active);

create index if not exists associate_availability_associate_day_idx
  on public.associate_availability (associate_id, day_of_week, is_active);

create index if not exists associate_services_associate_idx
  on public.associate_services (associate_id, is_active);

create index if not exists associate_services_service_idx
  on public.associate_services (service_id, is_active, skill_level, is_preferred);

create index if not exists appointments_date_idx
  on public.appointments (appointment_date);

create index if not exists appointments_associate_time_idx
  on public.appointments (associate_id, appointment_date, start_time, end_time, status);

create index if not exists appointments_room_time_idx
  on public.appointments (room_id, appointment_date, start_time, end_time, status);

create index if not exists appointments_client_time_idx
  on public.appointments (client_id, appointment_date, start_time, end_time, status);

create index if not exists appointments_referral_idx
  on public.appointments (referral_id);

create index if not exists appointments_transaction_idx
  on public.appointments (transaction_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_rooms_set_updated_at on public.rooms;
create trigger trg_rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_set_updated_at on public.appointments;
create trigger trg_appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

insert into public.rooms (room_name, room_type, capacity, is_active)
values
  ('Counseling Room 1', 'Counseling', 2, true),
  ('Counseling Room 2', 'Counseling', 2, true),
  ('Assessment Room', 'Assessment', 3, true),
  ('Play Therapy Room', 'Therapy', 4, true),
  ('Online Session', 'Online', 1, true)
on conflict (room_name) do nothing;

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

revoke all on function public.is_scheduling_user(uuid) from public;
grant execute on function public.is_scheduling_user(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.associate_availability enable row level security;
alter table public.associate_services enable row level security;
alter table public.appointments enable row level security;

drop policy if exists rooms_select_scheduling_users on public.rooms;
drop policy if exists rooms_insert_scheduling_users on public.rooms;
drop policy if exists rooms_update_scheduling_users on public.rooms;

create policy rooms_select_scheduling_users
on public.rooms
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy rooms_insert_scheduling_users
on public.rooms
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy rooms_update_scheduling_users
on public.rooms
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

drop policy if exists associate_availability_select_scheduling_users on public.associate_availability;
drop policy if exists associate_availability_insert_scheduling_users on public.associate_availability;
drop policy if exists associate_availability_update_scheduling_users on public.associate_availability;
drop policy if exists associate_availability_delete_scheduling_users on public.associate_availability;

create policy associate_availability_select_scheduling_users
on public.associate_availability
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy associate_availability_insert_scheduling_users
on public.associate_availability
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy associate_availability_update_scheduling_users
on public.associate_availability
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

create policy associate_availability_delete_scheduling_users
on public.associate_availability
for delete
to authenticated
using (public.is_scheduling_user(auth.uid()));

drop policy if exists associate_services_select_scheduling_users on public.associate_services;
drop policy if exists associate_services_insert_scheduling_users on public.associate_services;
drop policy if exists associate_services_update_scheduling_users on public.associate_services;
drop policy if exists associate_services_delete_scheduling_users on public.associate_services;

create policy associate_services_select_scheduling_users
on public.associate_services
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy associate_services_insert_scheduling_users
on public.associate_services
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy associate_services_update_scheduling_users
on public.associate_services
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));

create policy associate_services_delete_scheduling_users
on public.associate_services
for delete
to authenticated
using (public.is_scheduling_user(auth.uid()));

drop policy if exists appointments_select_scheduling_users on public.appointments;
drop policy if exists appointments_insert_scheduling_users on public.appointments;
drop policy if exists appointments_update_scheduling_users on public.appointments;

create policy appointments_select_scheduling_users
on public.appointments
for select
to authenticated
using (public.is_scheduling_user(auth.uid()));

create policy appointments_insert_scheduling_users
on public.appointments
for insert
to authenticated
with check (public.is_scheduling_user(auth.uid()));

create policy appointments_update_scheduling_users
on public.appointments
for update
to authenticated
using (public.is_scheduling_user(auth.uid()))
with check (public.is_scheduling_user(auth.uid()));
