-- Existing STAGING migration, version confirmed in Supabase history.
-- Installs an inactive maintenance function. No old rows are deleted here.
-- Does NOT enable pg_cron or schedule any automatic cleanup.
begin;

create schema if not exists coach_maintenance;
revoke all on schema coach_maintenance from public, anon, authenticated, service_role;

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

revoke all on function coach_maintenance.cleanup_old_coach_counters()
  from public, anon, authenticated, service_role;
commit;
