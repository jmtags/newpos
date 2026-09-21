-- Master data and service rows for Government Transaction Mode forms.
-- Run after database/23_add_government_transactions.sql.

create table if not exists public.government_cswd_offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text not null default '',
  contact_number text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.government_lgu_agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_person text not null default '',
  contact_number text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.government_social_workers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cswd_office_id uuid references public.government_cswd_offices(id) on delete set null,
  lgu_agency_id uuid references public.government_lgu_agencies(id) on delete set null,
  contact_number text not null default '',
  email text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (full_name, cswd_office_id, lgu_agency_id)
);

alter table public.government_transactions
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists cswd_office_id uuid references public.government_cswd_offices(id) on delete set null,
  add column if not exists lgu_agency_id uuid references public.government_lgu_agencies(id) on delete set null,
  add column if not exists social_worker_id uuid references public.government_social_workers(id) on delete set null;

create table if not exists public.government_transaction_items (
  id uuid primary key default gen_random_uuid(),
  government_transaction_id uuid not null references public.government_transactions(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists government_cswd_offices_name_idx
  on public.government_cswd_offices (name);

create index if not exists government_lgu_agencies_name_idx
  on public.government_lgu_agencies (name);

create index if not exists government_social_workers_name_idx
  on public.government_social_workers (full_name);

create index if not exists government_transactions_client_idx
  on public.government_transactions (client_id);

create index if not exists government_transactions_cswd_idx
  on public.government_transactions (cswd_office_id);

create index if not exists government_transactions_lgu_agency_idx
  on public.government_transactions (lgu_agency_id);

create index if not exists government_transactions_social_worker_idx
  on public.government_transactions (social_worker_id);

create index if not exists government_transaction_items_transaction_idx
  on public.government_transaction_items (government_transaction_id, sort_order, created_at);

drop trigger if exists trg_government_cswd_offices_set_updated_at
on public.government_cswd_offices;
create trigger trg_government_cswd_offices_set_updated_at
before update on public.government_cswd_offices
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_lgu_agencies_set_updated_at
on public.government_lgu_agencies;
create trigger trg_government_lgu_agencies_set_updated_at
before update on public.government_lgu_agencies
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_social_workers_set_updated_at
on public.government_social_workers;
create trigger trg_government_social_workers_set_updated_at
before update on public.government_social_workers
for each row execute function public.set_updated_at();

drop trigger if exists trg_government_transaction_items_set_updated_at
on public.government_transaction_items;
create trigger trg_government_transaction_items_set_updated_at
before update on public.government_transaction_items
for each row execute function public.set_updated_at();

alter table public.government_cswd_offices enable row level security;
alter table public.government_lgu_agencies enable row level security;
alter table public.government_social_workers enable row level security;
alter table public.government_transaction_items enable row level security;

drop policy if exists government_cswd_offices_authorized_all
on public.government_cswd_offices;
create policy government_cswd_offices_authorized_all
on public.government_cswd_offices
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_lgu_agencies_authorized_all
on public.government_lgu_agencies;
create policy government_lgu_agencies_authorized_all
on public.government_lgu_agencies
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_social_workers_authorized_all
on public.government_social_workers;
create policy government_social_workers_authorized_all
on public.government_social_workers
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_transaction_items_authorized_all
on public.government_transaction_items;
create policy government_transaction_items_authorized_all
on public.government_transaction_items
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_cswd_offices to authenticated;
grant select, insert, update, delete on public.government_lgu_agencies to authenticated;
grant select, insert, update, delete on public.government_social_workers to authenticated;
grant select, insert, update, delete on public.government_transaction_items to authenticated;

notify pgrst, 'reload schema';
