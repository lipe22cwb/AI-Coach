-- REVIEWED TEMPLATE ONLY: do not run directly in production.
-- Make a CLI-generated migration after reconciling migration history.
-- This only installs an inactive, private cleanup function. No cron job is scheduled.
-- Counts retained for 30 days; each run removes at most 5000 expired rows per table.
begin;

create schema if not exists coach_maintenance;
revoke all on schema coach_maintenance from public, anon, authenticated, service_role;

-- The existing paid-quota primary key begins with scope_key, so add an index
-- to support efficient expiration queries ordered by bucket_start.
create index if not exists coach_ai_quota_bucket_start_idx
  on public.coach_ai_quota_counters (bucket_start);

create or replace function coach_maintenance.cleanup_old_coach_counters()
returns table (paid_rows_deleted bigint, public_rows_deleted bigint)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_cutoff timestamptz := pg_catalog.transaction_timestamp() - interval '30 days';
begin
  -- Small batches avoid a large single-transaction delete after a long outage.
  with expired as (
    select c.ctid
    from public.coach_ai_quota_counters as c
    where c.bucket_start < v_cutoff
    order by c.bucket_start
    limit 5000
    for update skip locked
  )
  delete from public.coach_ai_quota_counters as target
  using expired
  where target.ctid = expired.ctid;
  get diagnostics paid_rows_deleted = row_count;

  with expired as (
    select c.ctid
    from public.coach_public_minute_counters as c
    where c.bucket_start < v_cutoff
    order by c.bucket_start
    limit 5000
    for update skip locked
  )
  delete from public.coach_public_minute_counters as target
  using expired
  where target.ctid = expired.ctid;
  get diagnostics public_rows_deleted = row_count;

  return next;
end;
$function$;

-- Keep the maintenance interface inaccessible to web/SDK roles. A reviewed
-- database-owner cron job can invoke the SECURITY INVOKER function later.
revoke all on function coach_maintenance.cleanup_old_coach_counters()
  from public, anon, authenticated, service_role;

commit;
