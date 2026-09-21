-- Government Transaction Mode database structure.
-- Run after database/22_add_expense_user_role.sql.

create sequence if not exists public.government_transaction_ref_seq;

create table if not exists public.government_transactions (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique,
  status text not null default 'referral_received'
    check (status in (
      'referral_received',
      'for_review',
      'costing_prepared',
      'guarantee_letter_received',
      'scheduled',
      'service_completed',
      'soa_submitted',
      'awaiting_cheque',
      'payment_completed'
    )),
  client_name text not null,
  client_contact text not null default '',
  cswd_office text not null default '',
  lgu_name text not null default '',
  social_worker text not null default '',
  referral_date date,
  referral_letter_reference text not null default '',
  selected_tests text not null default '',
  computed_fee numeric not null default 0,
  approved_amount numeric not null default 0,
  endorsement_number text not null default '',
  guarantee_letter_number text not null default '',
  guarantee_letter_date date,
  guarantee_valid_until date,
  schedule_date date,
  service_completed_date date,
  soa_number text not null default '',
  soa_submitted_date date,
  cheque_number text not null default '',
  cheque_released_date date,
  payment_amount numeric not null default 0,
  notes text not null default '',
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists government_transactions_status_idx
  on public.government_transactions (status);

create index if not exists government_transactions_referral_date_idx
  on public.government_transactions (referral_date desc);

create index if not exists government_transactions_lgu_idx
  on public.government_transactions (lgu_name);

create index if not exists government_transactions_gl_idx
  on public.government_transactions (guarantee_letter_number)
  where guarantee_letter_number <> '';

create index if not exists government_transactions_soa_idx
  on public.government_transactions (soa_number)
  where soa_number <> '';

create or replace function public.is_government_transaction_user(auth_id uuid)
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

create or replace function public.assign_government_transaction_reference()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate_reference text;
begin
  if nullif(trim(coalesce(new.reference_number, '')), '') is not null then
    new.reference_number := upper(trim(new.reference_number));
    return new;
  end if;

  loop
    candidate_reference :=
      'GOV-' ||
      to_char(coalesce(new.created_at, now()) at time zone 'Asia/Manila', 'YYYYMMDD') ||
      '-' ||
      lpad(nextval('public.government_transaction_ref_seq')::text, 4, '0');

    exit when not exists (
      select 1
      from public.government_transactions
      where reference_number = candidate_reference
    );
  end loop;

  new.reference_number := candidate_reference;
  return new;
end;
$$;

drop trigger if exists trg_government_transactions_assign_reference
on public.government_transactions;

create trigger trg_government_transactions_assign_reference
before insert on public.government_transactions
for each row execute function public.assign_government_transaction_reference();

drop trigger if exists trg_government_transactions_set_updated_at
on public.government_transactions;

create trigger trg_government_transactions_set_updated_at
before update on public.government_transactions
for each row execute function public.set_updated_at();

alter table public.government_transactions enable row level security;

drop policy if exists government_transactions_authorized_all
on public.government_transactions;

create policy government_transactions_authorized_all
on public.government_transactions
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_transactions to authenticated;
grant usage, select on sequence public.government_transaction_ref_seq to authenticated;
grant execute on function public.is_government_transaction_user(uuid) to authenticated;

notify pgrst, 'reload schema';
