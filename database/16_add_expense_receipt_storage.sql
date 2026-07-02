-- Private receipt image storage for the expense ledger.
-- Run after database/15_add_expense_and_profitability_modules.sql.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_finance_select on storage.objects;
create policy expense_receipts_finance_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);

drop policy if exists expense_receipts_finance_insert on storage.objects;
create policy expense_receipts_finance_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);

drop policy if exists expense_receipts_finance_update on storage.objects;
create policy expense_receipts_finance_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
)
with check (
  bucket_id = 'expense-receipts'
  and public.is_finance_user(auth.uid())
);
