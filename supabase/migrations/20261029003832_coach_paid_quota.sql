-- Explicit opt-in paid AI requests. Apply and test in staging first.
-- This atomic quota is shared across all Next.js instances and both paid routes.
-- Usage is a conservative request reservation, not a financial ledger.
-- Configure a HARD budget at the AI provider independently.

begin;

create table if not exists public.coach_ai_quota_counters (
  scope_key text not null,
  bucket_start timestamptz not null,
  usage_count integer not null default 0 check (usage_count >= 0),
  primary key (scope_key, bucket_start)
);

alter table public.coach_ai_quota_counters enable row level security;
revoke all on public.coach_ai_quota_counters from public, anon, authenticated;
-- Only the server-side secret role can read/update counters. The RPC is
-- SECURITY INVOKER, so it cannot elevate ordinary browser permissions.
revoke all on public.coach_ai_quota_counters from service_role;
grant select, insert, update on public.coach_ai_quota_counters to service_role;

create or replace function public.reserve_coach_ai_request(p_user_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minute timestamptz := date_trunc('minute', transaction_timestamp());
  v_day timestamptz := date_trunc('day', transaction_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_per_minute integer := 0;
  v_per_day integer := 0;
  v_global_day integer := 0;
  v_minute_key text := 'user-minute:' || p_user_id::text;
  v_day_key text := 'user-day:' || p_user_id::text;
begin
  if p_user_id is null then return false; end if;

  -- One global transaction-level lock serializes all reservations. Simpler and
  -- safer than read-then-write quotas that race on multiple server instances.
  perform pg_catalog.pg_advisory_xact_lock(451228, 907);

  select usage_count into v_per_minute
  from public.coach_ai_quota_counters
  where scope_key = v_minute_key and bucket_start = v_minute;

  select usage_count into v_per_day
  from public.coach_ai_quota_counters
  where scope_key = v_day_key and bucket_start = v_day;

  select usage_count into v_global_day
  from public.coach_ai_quota_counters
  where scope_key = 'global-day' and bucket_start = v_day;

  -- Conservative quotas: at most 3/minute and 10/day per player, 200/day total.
  if coalesce(v_per_minute, 0) >= 3
     or coalesce(v_per_day, 0) >= 10
     or coalesce(v_global_day, 0) >= 200 then
    return false;
  end if;

  insert into public.coach_ai_quota_counters (scope_key, bucket_start, usage_count)
  values (v_minute_key, v_minute, 1),
         (v_day_key, v_day, 1),
         ('global-day', v_day, 1)
  on conflict (scope_key, bucket_start) do update
    set usage_count = public.coach_ai_quota_counters.usage_count + 1;

  return true;
end;
$$;

revoke all on function public.reserve_coach_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_coach_ai_request(uuid) to service_role;

commit;
