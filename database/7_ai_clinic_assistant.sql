-- AI Clinic Operations Assistant support.
-- Run this in Supabase SQL Editor before deploying the Edge Function.

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  auth_user_id uuid,
  role text,
  question text not null,
  answer text,
  tools_used jsonb not null default '[]'::jsonb,
  source_summary jsonb not null default '{}'::jsonb,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_logs_auth_user_created_idx
  on public.ai_logs (auth_user_id, created_at desc);

create index if not exists ai_logs_created_idx
  on public.ai_logs (created_at desc);

create or replace function public.ai_can_use_assistant(auth_id uuid)
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

create or replace function public.ai_is_admin_user(auth_id uuid)
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
      and role = 'admin'
      and is_active = true
  );
$$;

revoke all on function public.ai_can_use_assistant(uuid) from public;
revoke all on function public.ai_is_admin_user(uuid) from public;
grant execute on function public.ai_can_use_assistant(uuid) to authenticated;
grant execute on function public.ai_is_admin_user(uuid) to authenticated;

alter table public.ai_logs enable row level security;

drop policy if exists ai_logs_insert_allowed_users on public.ai_logs;
drop policy if exists ai_logs_select_own_or_admin on public.ai_logs;

create policy ai_logs_insert_allowed_users
on public.ai_logs
for insert
to authenticated
with check (
  public.ai_can_use_assistant(auth.uid())
  and auth_user_id = auth.uid()
);

create policy ai_logs_select_own_or_admin
on public.ai_logs
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.ai_is_admin_user(auth.uid())
);

create or replace function public.ai_get_today_appointments(
  target_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.start_time)
    from (
      select
        a.id,
        a.appointment_date,
        a.start_time,
        a.end_time,
        a.status,
        a.appointment_type,
        a.payment_status,
        a.amount_due,
        a.amount_paid,
        c.full_name as client_name,
        s.name as service_name,
        mha.full_name as associate_name,
        r.room_name,
        ref.referral_name
      from public.appointments a
      left join public.clients c on c.id = a.client_id
      left join public.services s on s.id = a.service_id
      left join public.mental_health_associates mha on mha.id = a.associate_id
      left join public.rooms r on r.id = a.room_id
      left join public.referrals ref on ref.id = a.referral_id
      where a.appointment_date = target_date
        and a.status <> 'Cancelled'
      order by a.start_time
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_available_rooms(
  target_date date default ((now() at time zone 'Asia/Manila')::date),
  start_at time default null,
  end_at time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.room_name)
    from (
      select
        r.id,
        r.room_name,
        r.room_type,
        r.capacity,
        r.notes,
        case
          when start_at is null or end_at is null then true
          else not exists (
            select 1
            from public.appointments a
            where a.room_id = r.id
              and a.appointment_date = target_date
              and a.status <> 'Cancelled'
              and a.start_time < end_at
              and a.end_time > start_at
          )
        end as is_available,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'appointment_id', a.id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'status', a.status
          ) order by a.start_time)
          from public.appointments a
          where a.room_id = r.id
            and a.appointment_date = target_date
            and a.status <> 'Cancelled'
        ), '[]'::jsonb) as appointments
      from public.rooms r
      where r.is_active = true
      order by r.room_name
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_associate_availability(
  target_date date default ((now() at time zone 'Asia/Manila')::date),
  associate_id_filter uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  target_day integer := extract(dow from target_date)::integer;
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.associate_name)
    from (
      select
        mha.id,
        mha.full_name as associate_name,
        mha.title,
        mha.profession,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'start_time', av.start_time,
            'end_time', av.end_time
          ) order by av.start_time)
          from public.associate_availability av
          where av.associate_id = mha.id
            and av.day_of_week = target_day
            and av.is_active = true
        ), '[]'::jsonb) as availability,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'appointment_id', a.id,
            'start_time', a.start_time,
            'end_time', a.end_time,
            'status', a.status,
            'service_name', s.name,
            'client_name', c.full_name
          ) order by a.start_time)
          from public.appointments a
          left join public.services s on s.id = a.service_id
          left join public.clients c on c.id = a.client_id
          where a.associate_id = mha.id
            and a.appointment_date = target_date
            and a.status <> 'Cancelled'
        ), '[]'::jsonb) as appointments
      from public.mental_health_associates mha
      where mha.is_active = true
        and (associate_id_filter is null or mha.id = associate_id_filter)
      order by mha.full_name
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_unpaid_transactions(
  limit_count integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.transaction_date desc)
    from (
      select
        t.id,
        t.transaction_number,
        t.transaction_date,
        c.full_name as client_name,
        t.total_amount,
        t.total_paid,
        t.balance,
        t.payment_status,
        t.notes
      from public.transactions t
      left join public.clients c on c.id = t.client_id
      where coalesce(t.is_void, false) = false
        and (
          coalesce(t.balance, 0) > 0
          or t.payment_status in ('Unpaid', 'Partial')
        )
      order by t.transaction_date desc
      limit greatest(1, least(coalesce(limit_count, 20), 100))
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_revenue_summary(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    with filtered as (
      select *
      from public.transactions t
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
    ),
    payment_rollup as (
      select
        p.transaction_id,
        sum(case when p.amount > 0 then p.amount else 0 end) as payments_collected,
        sum(case when p.amount < 0 then abs(p.amount) else 0 end) as refunds_recorded
      from public.payments p
      join filtered f on f.id = p.transaction_id
      group by p.transaction_id
    )
    select jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date,
      'transaction_count', count(f.id),
      'gross_sales', coalesce(sum(f.total_amount), 0),
      'subtotal', coalesce(sum(f.subtotal), 0),
      'discounts', coalesce(sum(f.discount_amount), 0),
      'tax', coalesce(sum(f.tax_amount), 0),
      'payments_collected', coalesce(sum(pr.payments_collected), 0),
      'refunds_recorded', coalesce(sum(pr.refunds_recorded), 0),
      'net_collected', coalesce(sum(pr.payments_collected), 0) - coalesce(sum(pr.refunds_recorded), 0),
      'outstanding_balance', coalesce(sum(f.balance), 0),
      'paid_count', count(*) filter (where f.payment_status = 'Paid'),
      'partial_count', count(*) filter (where f.payment_status = 'Partial'),
      'unpaid_count', count(*) filter (where f.payment_status = 'Unpaid')
    )
    from filtered f
    left join payment_rollup pr on pr.transaction_id = f.id
  ), '{}'::jsonb);
end;
$$;

create or replace function public.ai_get_referral_summary(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.revenue desc)
    from (
      select
        coalesce(ti.referral_name, 'No referral') as referral_name,
        count(distinct t.id) as transaction_count,
        count(ti.id) as line_item_count,
        coalesce(sum(ti.line_total), 0) as revenue
      from public.transaction_items ti
      join public.transactions t on t.id = ti.transaction_id
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
      group by coalesce(ti.referral_name, 'No referral')
      order by revenue desc
      limit 25
    ) rows
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ai_get_service_performance(
  start_date date default ((now() at time zone 'Asia/Manila')::date),
  end_date date default ((now() at time zone 'Asia/Manila')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.ai_can_use_assistant(auth.uid()) then
    raise exception 'Not authorized to use AI assistant.';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(rows) order by rows.revenue desc)
    from (
      select
        ti.service_name,
        count(distinct t.id) as transaction_count,
        sum(ti.quantity) as quantity_sold,
        coalesce(sum(ti.quantity * ti.unit_price), 0) as gross_amount,
        coalesce(sum(ti.discount_amount), 0) as discounts,
        coalesce(sum(ti.line_total), 0) as revenue
      from public.transaction_items ti
      join public.transactions t on t.id = ti.transaction_id
      where (t.transaction_date at time zone 'Asia/Manila')::date
        between start_date and end_date
        and coalesce(t.is_void, false) = false
      group by ti.service_name
      order by revenue desc
      limit 25
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.ai_get_today_appointments(date) from public;
revoke all on function public.ai_get_available_rooms(date, time, time) from public;
revoke all on function public.ai_get_associate_availability(date, uuid) from public;
revoke all on function public.ai_get_unpaid_transactions(integer) from public;
revoke all on function public.ai_get_revenue_summary(date, date) from public;
revoke all on function public.ai_get_referral_summary(date, date) from public;
revoke all on function public.ai_get_service_performance(date, date) from public;

grant execute on function public.ai_get_today_appointments(date) to authenticated;
grant execute on function public.ai_get_available_rooms(date, time, time) to authenticated;
grant execute on function public.ai_get_associate_availability(date, uuid) to authenticated;
grant execute on function public.ai_get_unpaid_transactions(integer) to authenticated;
grant execute on function public.ai_get_revenue_summary(date, date) to authenticated;
grant execute on function public.ai_get_referral_summary(date, date) to authenticated;
grant execute on function public.ai_get_service_performance(date, date) to authenticated;
