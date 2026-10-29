-- STAGING FIRST. This is a reviewed SQL template; do not apply to production.
-- For a tracked deployment, create a new Supabase migration via CLI, then
-- place this SQL into that generated migration (do not invent a timestamp).
-- Global admission guard: 120 requests/minute shared by all Coaching POST routes.
-- This is NOT per-IP abuse protection and does NOT replace an edge/WAF limit.
begin;

create table if not exists public.coach_public_minute_counters (
  bucket_start timestamptz primary key,
  usage_count integer not null check (usage_count >= 1)
);

alter table public.coach_public_minute_counters enable row level security;
revoke all on public.coach_public_minute_counters from public, anon, authenticated;
revoke all on public.coach_public_minute_counters from service_role;
grant select, insert, update on public.coach_public_minute_counters to service_role;

create or replace function public.reserve_public_coach_request()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bucket timestamptz := pg_catalog.date_trunc('minute', pg_catalog.transaction_timestamp());
  v_admitted boolean := false;
begin
  -- INSERT .. ON CONFLICT locks the shared minute row atomically, including
  -- simultaneous requests across multiple Next.js server processes.
  insert into public.coach_public_minute_counters as c (bucket_start, usage_count)
  values (v_bucket, 1)
  on conflict (bucket_start) do update
    set usage_count = c.usage_count + 1
    where c.usage_count < 120
  returning true into v_admitted;

  return coalesce(v_admitted, false);
end;
$$;

revoke all on function public.reserve_public_coach_request() from public, anon, authenticated;
grant execute on function public.reserve_public_coach_request() to service_role;
commit;
