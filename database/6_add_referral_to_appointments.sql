-- Add referral source support to scheduled appointments.
-- Run this once after the scheduling module migration.

alter table public.appointments
  add column if not exists referral_id uuid references public.referrals(id);

create index if not exists appointments_referral_idx
  on public.appointments (referral_id);
