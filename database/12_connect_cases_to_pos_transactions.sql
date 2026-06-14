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
