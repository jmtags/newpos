-- Add missing associate notes column used by the Associate/s screen.
-- Run this once on existing Supabase projects.

alter table public.mental_health_associates
  add column if not exists notes text;

notify pgrst, 'reload schema';
