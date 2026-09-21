-- Batch Statement of Account generation for Government Transaction Mode.
-- Run after database/26_add_government_support_documents.sql.

create table if not exists public.government_soa_batch_settings (
  id uuid primary key default gen_random_uuid(),
  default_prepared_by_name text not null default '',
  default_prepared_by_title text not null default '',
  default_received_by_label text not null default 'SIGNATURE OVER PRINTED/NAME/DATE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_government_soa_batch_settings_set_updated_at
on public.government_soa_batch_settings;
create trigger trg_government_soa_batch_settings_set_updated_at
before update on public.government_soa_batch_settings
for each row execute function public.set_updated_at();

insert into public.government_soa_batch_settings (
  default_prepared_by_name,
  default_prepared_by_title,
  default_received_by_label
)
select
  'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  'Director & Psychologist, Service Provider',
  'SIGNATURE OVER PRINTED/NAME/DATE'
where not exists (select 1 from public.government_soa_batch_settings);

create table if not exists public.government_soa_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  lgu_agency_id uuid references public.government_lgu_agencies(id) on delete set null,
  lgu_name text not null default '',
  date_from date,
  date_to date,
  prepared_by_name text not null default '',
  prepared_by_title text not null default '',
  received_by_label text not null default '',
  total_amount numeric not null default 0,
  transaction_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_government_soa_batches_set_updated_at
on public.government_soa_batches;
create trigger trg_government_soa_batches_set_updated_at
before update on public.government_soa_batches
for each row execute function public.set_updated_at();

create index if not exists government_soa_batches_created_idx
  on public.government_soa_batches (created_at desc);

create index if not exists government_soa_batches_lgu_idx
  on public.government_soa_batches (lgu_agency_id);

alter table public.government_soa_batch_settings enable row level security;
alter table public.government_soa_batches enable row level security;

drop policy if exists government_soa_batch_settings_authorized_all
on public.government_soa_batch_settings;
create policy government_soa_batch_settings_authorized_all
on public.government_soa_batch_settings
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_soa_batches_authorized_all
on public.government_soa_batches;
create policy government_soa_batches_authorized_all
on public.government_soa_batches
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_soa_batch_settings to authenticated;
grant select, insert, update, delete on public.government_soa_batches to authenticated;

notify pgrst, 'reload schema';
