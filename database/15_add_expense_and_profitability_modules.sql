-- Expense ledger and profitability reporting.
-- Only active administrators and managers can access these records.

create or replace function public.is_finance_user(auth_id uuid)
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
      and role in ('admin', 'manager')
      and is_active = true
  );
$$;

revoke all on function public.is_finance_user(uuid) from public;
grant execute on function public.is_finance_user(uuid) to authenticated;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_number text not null unique,
  category_id uuid references public.expense_categories(id),
  expense_date date not null default ((now() at time zone 'Asia/Manila')::date),
  paid_date date,
  vendor text,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  payment_method text,
  reference_number text,
  recurrence text not null default 'One-time'
    check (recurrence in ('One-time', 'Weekly', 'Monthly', 'Quarterly', 'Yearly')),
  status text not null default 'Paid'
    check (status in ('Pending', 'Paid', 'Void')),
  receipt_url text,
  notes text,
  created_by_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'Paid' or paid_date is not null)
);

create sequence if not exists public.expense_number_seq;

create or replace function public.set_expense_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.expense_number is null or length(trim(new.expense_number)) = 0 then
    new.expense_number :=
      'EXP-' || to_char(now() at time zone 'Asia/Manila', 'YYYYMM') ||
      '-' || lpad(nextval('public.expense_number_seq')::text, 5, '0');
  end if;

  if new.status = 'Paid' and new.paid_date is null then
    new.paid_date := new.expense_date;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_expenses_set_expense_number on public.expenses;
create trigger trg_expenses_set_expense_number
before insert on public.expenses
for each row execute function public.set_expense_number();

drop trigger if exists trg_expense_categories_set_updated_at on public.expense_categories;
create trigger trg_expense_categories_set_updated_at
before update on public.expense_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_expenses_set_updated_at on public.expenses;
create trigger trg_expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create index if not exists expense_categories_active_idx
  on public.expense_categories (is_active, name);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_paid_date_idx on public.expenses (paid_date desc);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_status_idx on public.expenses (status);

insert into public.expense_categories (name, description)
values
  ('Rent', 'Clinic rent and lease payments'),
  ('Utilities', 'Electricity, water, internet, and telephone'),
  ('Payroll', 'Salaries, wages, and staff benefits'),
  ('Professional Fees', 'Associate and external professional fees'),
  ('Clinic Supplies', 'Clinical, office, and sanitation supplies'),
  ('Software & Subscriptions', 'Software licenses and online services'),
  ('Marketing', 'Advertising and promotional expenses'),
  ('Taxes & Government Fees', 'Taxes, permits, and regulatory fees'),
  ('Repairs & Maintenance', 'Equipment and facility maintenance'),
  ('Other', 'Unclassified operating expenses')
on conflict (name) do nothing;

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists expense_categories_finance_all on public.expense_categories;
create policy expense_categories_finance_all
on public.expense_categories
for all
to authenticated
using (public.is_finance_user(auth.uid()))
with check (public.is_finance_user(auth.uid()));

drop policy if exists expenses_finance_all on public.expenses;
create policy expenses_finance_all
on public.expenses
for all
to authenticated
using (public.is_finance_user(auth.uid()))
with check (public.is_finance_user(auth.uid()));

grant select, insert, update, delete on public.expense_categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant usage, select on sequence public.expense_number_seq to authenticated;
