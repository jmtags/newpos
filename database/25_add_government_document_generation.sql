-- Document generation support for Government Transaction Mode.
-- Run after database/24_add_government_transaction_form_support.sql.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'government_transactions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%status%'
      and pg_get_constraintdef(con.oid) like '%referral_received%'
  loop
    execute format(
      'alter table public.government_transactions drop constraint if exists %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.government_transactions
  add constraint government_transactions_status_check
  check (status in (
    'referral_received',
    'for_review',
    'costing_prepared',
    'endorsement_ready',
    'guarantee_letter_received',
    'scheduled',
    'service_completed',
    'soa_submitted',
    'awaiting_cheque',
    'payment_completed'
  )) not valid;

do $$
begin
  if not exists (
    select 1
    from public.government_transactions
    where status not in (
      'referral_received',
      'for_review',
      'costing_prepared',
      'endorsement_ready',
      'guarantee_letter_received',
      'scheduled',
      'service_completed',
      'soa_submitted',
      'awaiting_cheque',
      'payment_completed'
    )
  ) then
    alter table public.government_transactions
      validate constraint government_transactions_status_check;
  end if;
end;
$$;

create table if not exists public.government_document_settings (
  id uuid primary key default gen_random_uuid(),
  header_line_1 text not null default '',
  header_line_2 text not null default '',
  header_line_3 text not null default '',
  default_recipient_name text not null default '',
  default_recipient_title text not null default '',
  endorsement_signatory_name text not null default '',
  endorsement_signatory_title text not null default '',
  endorsement_signatory_role text not null default '',
  prepared_by_name text not null default '',
  prepared_by_title text not null default '',
  noted_by_name text not null default '',
  noted_by_title text not null default '',
  endorsement_body text not null default '',
  costing_footer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_government_document_settings_set_updated_at
on public.government_document_settings;
create trigger trg_government_document_settings_set_updated_at
before update on public.government_document_settings
for each row execute function public.set_updated_at();

insert into public.government_document_settings (
  header_line_1,
  header_line_2,
  header_line_3,
  default_recipient_name,
  default_recipient_title,
  endorsement_signatory_name,
  endorsement_signatory_title,
  endorsement_signatory_role,
  prepared_by_name,
  prepared_by_title,
  noted_by_name,
  noted_by_title,
  endorsement_body,
  costing_footer
)
select
  '',
  '',
  '',
  '',
  '',
  'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  'Psychologist, Service Provider',
  'Psyzygy Psychological Center, Inc.',
  'Aprilyne D. Fabros, RPm',
  'Case Manager',
  'Dr. Josevy A. Taguibao, RPsy, RGC, LPT',
  'Psychologist, Service Provider',
  'We respectfully endorse the client/beneficiary for psychological services based on the reviewed referral and the selected clinic services. The clinic will provide the necessary services with confidentiality, professionalism, and ethical care.',
  'Prepared for government guarantee letter processing and billing documentation.'
where not exists (select 1 from public.government_document_settings);

alter table public.government_document_settings enable row level security;

drop policy if exists government_document_settings_authorized_all
on public.government_document_settings;
create policy government_document_settings_authorized_all
on public.government_document_settings
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

grant select, insert, update, delete on public.government_document_settings to authenticated;

notify pgrst, 'reload schema';
