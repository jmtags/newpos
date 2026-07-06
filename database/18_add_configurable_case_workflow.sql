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
