-- Generate client codes from a PostgreSQL sequence. Unlike MAX(client_code) + 1,
-- nextval() is atomic even when multiple inserts run at exactly the same time.

create sequence if not exists public.client_code_seq;

do $$
declare
  max_client_number bigint;
begin
  select max(substring(client_code from '^CLT-([0-9]+)$')::bigint)
  into max_client_number
  from public.clients;

  if max_client_number is null then
    perform setval('public.client_code_seq', 1, false);
  else
    perform setval('public.client_code_seq', max_client_number, true);
  end if;
end;
$$;

create or replace function public.assign_client_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  candidate_code text;
begin
  -- Never trust a browser-generated code. Older deployed app versions may send
  -- a stale non-empty value, so every insert receives a fresh server-side code.
  loop
    candidate_code :=
      'CLT-' || lpad(nextval('public.client_code_seq')::text, 3, '0');

    exit when not exists (
      select 1
      from public.clients
      where client_code = candidate_code
    );
  end loop;

  new.client_code := candidate_code;

  return new;
end;
$$;

drop trigger if exists trg_clients_assign_client_code on public.clients;
create trigger trg_clients_assign_client_code
before insert on public.clients
for each row execute function public.assign_client_code();

grant usage, select on sequence public.client_code_seq to authenticated;
