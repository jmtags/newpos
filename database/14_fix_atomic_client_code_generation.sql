-- Generate client codes inside PostgreSQL to prevent concurrent inserts from
-- selecting the same "next" CLT number.

create or replace function public.assign_client_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_client_number bigint;
begin
  -- Never trust a browser-generated code. Older deployed app versions may send
  -- a stale non-empty value, so every insert receives a fresh server-side code.
  -- This lock is held until the insert transaction finishes.
  perform pg_advisory_xact_lock(hashtext('public.clients.client_code'));

  select coalesce(
    max(substring(client_code from '^CLT-([0-9]+)$')::bigint),
    0
  ) + 1
  into next_client_number
  from public.clients;

  new.client_code :=
    'CLT-' || lpad(next_client_number::text, 3, '0');

  return new;
end;
$$;

drop trigger if exists trg_clients_assign_client_code on public.clients;
create trigger trg_clients_assign_client_code
before insert on public.clients
for each row execute function public.assign_client_code();
