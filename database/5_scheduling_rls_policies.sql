-- RLS policies for the Scheduling module.
-- Run this if saving rooms, availability, service tags, or appointments fails
-- with "new row violates row-level security policy".

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
