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
