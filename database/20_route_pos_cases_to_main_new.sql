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
