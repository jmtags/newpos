-- Private case document storage and metadata.
-- Run after database/20_route_pos_cases_to_main_new.sql.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'case-documents',
  'case-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  file_name text not null,
  file_path text not null unique,
  mime_type text not null,
  file_size bigint not null default 0,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists case_documents_case_idx
  on public.case_documents (case_id, created_at desc);

alter table public.case_documents enable row level security;

create or replace function public.case_can_view_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.cases c
    where c.id = target_case_id
      and public.case_can_access_associate(c.associate_id)
  );
$$;

create or replace function public.case_document_to_json(document_row public.case_documents)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', document_row.id,
    'case_id', document_row.case_id,
    'file_name', document_row.file_name,
    'file_path', document_row.file_path,
    'mime_type', document_row.mime_type,
    'file_size', document_row.file_size,
    'uploaded_by_user_id', document_row.uploaded_by_user_id,
    'created_at', document_row.created_at
  );
$$;

create or replace function public.case_document_create(
  target_case_id uuid,
  file_name text,
  file_path text,
  mime_type text,
  file_size bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  new_document public.case_documents;
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to add case documents.');
  end if;

  if not public.case_can_view_case(target_case_id) then
    return jsonb_build_object('success', false, 'message', 'Case was not found or cannot be accessed.');
  end if;

  if lower(coalesce(mime_type, '')) not in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ) then
    return jsonb_build_object('success', false, 'message', 'Only PDF, DOC, DOCX, and text files are allowed.');
  end if;

  if nullif(trim(coalesce(file_name, '')), '') is null
    or nullif(trim(coalesce(file_path, '')), '') is null then
    return jsonb_build_object('success', false, 'message', 'Document file name and storage path are required.');
  end if;

  insert into public.case_documents (
    case_id,
    file_name,
    file_path,
    mime_type,
    file_size,
    uploaded_by_user_id
  )
  values (
    target_case_id,
    trim(file_name),
    trim(file_path),
    lower(mime_type),
    greatest(coalesce(file_size, 0), 0),
    public.case_current_user_id()
  )
  returning * into new_document;

  return jsonb_build_object(
    'success', true,
    'message', 'Case document added successfully.',
    'data', public.case_document_to_json(new_document)
  );
end;
$$;

create or replace function public.case_document_list(target_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.case_can_use_module() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to view case documents.');
  end if;

  if not public.case_can_view_case(target_case_id) then
    return jsonb_build_object('success', false, 'message', 'Case was not found or cannot be accessed.');
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'Case documents loaded successfully.',
    'data', coalesce((
      select jsonb_agg(public.case_document_to_json(doc) order by doc.created_at desc)
      from public.case_documents doc
      where doc.case_id = target_case_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.case_document_delete(target_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_document public.case_documents;
begin
  if not public.case_can_manage_cases() then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to delete case documents.');
  end if;

  select *
  into target_document
  from public.case_documents
  where id = target_document_id;

  if target_document.id is null then
    return jsonb_build_object('success', false, 'message', 'Case document was not found.');
  end if;

  if not public.case_can_view_case(target_document.case_id) then
    return jsonb_build_object('success', false, 'message', 'You are not authorized to delete this case document.');
  end if;

  delete from public.case_documents
  where id = target_document_id;

  return jsonb_build_object(
    'success', true,
    'message', 'Case document deleted successfully.',
    'data', public.case_document_to_json(target_document)
  );
end;
$$;

drop policy if exists case_documents_select_case_users on public.case_documents;
create policy case_documents_select_case_users
on public.case_documents
for select
to authenticated
using (public.case_can_view_case(case_id));

drop policy if exists case_documents_insert_case_managers on public.case_documents;
create policy case_documents_insert_case_managers
on public.case_documents
for insert
to authenticated
with check (public.case_can_manage_cases() and public.case_can_view_case(case_id));

drop policy if exists case_documents_delete_case_managers on public.case_documents;
create policy case_documents_delete_case_managers
on public.case_documents
for delete
to authenticated
using (public.case_can_manage_cases() and public.case_can_view_case(case_id));

drop policy if exists case_documents_storage_select on storage.objects;
create policy case_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'case-documents'
  and exists (
    select 1
    from public.case_documents doc
    where doc.file_path = storage.objects.name
      and public.case_can_view_case(doc.case_id)
  )
);

drop policy if exists case_documents_storage_insert on storage.objects;
create policy case_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'case-documents'
  and public.case_can_manage_cases()
);

drop policy if exists case_documents_storage_delete on storage.objects;
create policy case_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'case-documents'
  and public.case_can_manage_cases()
);

grant select, insert, delete on public.case_documents to authenticated;
grant execute on function public.case_can_view_case(uuid) to authenticated;
grant execute on function public.case_document_create(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.case_document_list(uuid) to authenticated;
grant execute on function public.case_document_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
