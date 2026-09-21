-- Support document uploads for Government Transaction Mode.
-- Run after database/25_add_government_document_generation.sql.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'government-documents',
  'government-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.government_transaction_documents (
  id uuid primary key default gen_random_uuid(),
  government_transaction_id uuid not null references public.government_transactions(id) on delete cascade,
  document_type text not null check (document_type in (
    'referral_letter',
    'guarantee_letter',
    'soa_document',
    'cheque_payment_proof',
    'other_supporting_document'
  )),
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size bigint not null default 0,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists government_transaction_documents_transaction_idx
  on public.government_transaction_documents (
    government_transaction_id,
    document_type,
    created_at desc
  );

alter table public.government_transaction_documents enable row level security;

drop policy if exists government_transaction_documents_authorized_all
on public.government_transaction_documents;
create policy government_transaction_documents_authorized_all
on public.government_transaction_documents
for all
to authenticated
using (public.is_government_transaction_user(auth.uid()))
with check (public.is_government_transaction_user(auth.uid()));

drop policy if exists government_documents_storage_select
on storage.objects;
create policy government_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'government-documents'
  and public.is_government_transaction_user(auth.uid())
);

drop policy if exists government_documents_storage_insert
on storage.objects;
create policy government_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'government-documents'
  and public.is_government_transaction_user(auth.uid())
);

drop policy if exists government_documents_storage_delete
on storage.objects;
create policy government_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'government-documents'
  and public.is_government_transaction_user(auth.uid())
);

grant select, insert, update, delete on public.government_transaction_documents to authenticated;

notify pgrst, 'reload schema';
