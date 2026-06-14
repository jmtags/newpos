-- Role-based access control for Case Management.
-- Run after database/9_add_case_management_backend_api.sql.

do $$
begin
  alter table public.users
    drop constraint if exists users_role_check;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_check
      check (
        role in (
          'admin',
          'manager',
          'case_staff',
          'associate_user',
          'case_viewer',
          'regular_user'
        )
      );
  end if;
end $$;

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
