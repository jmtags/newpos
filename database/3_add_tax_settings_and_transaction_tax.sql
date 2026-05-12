-- Philippine tax configuration and transaction tax snapshot fields.
-- Run this once in Supabase SQL Editor before deploying the React changes.

alter table public.clinic_settings
  add column if not exists tax_enabled boolean not null default true,
  add column if not exists tax_type text not null default 'NON_VAT',
  add column if not exists tax_rate numeric not null default 12,
  add column if not exists tax_inclusive boolean not null default true,
  add column if not exists bir_registered boolean not null default false,
  add column if not exists tin_number text,
  add column if not exists receipt_footer text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinic_settings_tax_type_check'
  ) then
    alter table public.clinic_settings
      add constraint clinic_settings_tax_type_check
      check (tax_type in ('VAT', 'NON_VAT', 'NONE'));
  end if;
end $$;

alter table public.transactions
  add column if not exists subtotal numeric not null default 0,
  add column if not exists tax_amount numeric not null default 0,
  add column if not exists tax_rate numeric not null default 0,
  add column if not exists tax_type text,
  add column if not exists grand_total numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_tax_type_check'
  ) then
    alter table public.transactions
      add constraint transactions_tax_type_check
      check (tax_type is null or tax_type in ('VAT', 'NON_VAT', 'NONE'));
  end if;
end $$;

update public.clinic_settings
set
  tax_enabled = coalesce(tax_enabled, true),
  tax_type = coalesce(tax_type, 'NON_VAT'),
  tax_rate = coalesce(tax_rate, 12),
  tax_inclusive = coalesce(tax_inclusive, true),
  bir_registered = coalesce(bir_registered, false);

update public.transactions
set
  tax_amount = coalesce(tax_amount, 0),
  tax_rate = coalesce(tax_rate, 0),
  tax_type = coalesce(tax_type, 'NON_VAT'),
  grand_total = coalesce(nullif(grand_total, 0), total_amount, 0);

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
