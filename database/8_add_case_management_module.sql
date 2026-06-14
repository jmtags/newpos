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
