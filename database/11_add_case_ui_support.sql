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
