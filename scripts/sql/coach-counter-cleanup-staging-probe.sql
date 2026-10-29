-- STAGING ONLY. Execute with a database-owner role AFTER installing the helper.
-- No data survives: all sample inserts and cleanup deletes are rolled back.
-- Run as a full script in the Supabase SQL Editor; do NOT remove the rollback.
begin;

-- Avoid touching authentic user quotas: use synthetic scope keys.
insert into public.coach_ai_quota_counters (scope_key, bucket_start, usage_count)
values
  ('maintenance-probe-old', '2000-01-01 00:00:00+00', 1),
  ('maintenance-probe-recent', pg_catalog.date_trunc('minute', pg_catalog.transaction_timestamp()), 1);

-- Public limit counters use bucket_start alone as their primary key.
insert into public.coach_public_minute_counters (bucket_start, usage_count)
values ('2000-01-01 00:00:00+00', 1);

select * from coach_maintenance.cleanup_old_coach_counters();

do $verify$
begin
  if exists (
    select 1 from public.coach_ai_quota_counters
    where scope_key = 'maintenance-probe-old'
  ) then
    raise exception 'Old paid quota probe row survived cleanup';
  end if;

  if not exists (
    select 1 from public.coach_ai_quota_counters
    where scope_key = 'maintenance-probe-recent'
  ) then
    raise exception 'Recent paid quota probe row was deleted';
  end if;

  if exists (
    select 1 from public.coach_public_minute_counters
    where bucket_start = '2000-01-01 00:00:00+00'
  ) then
    raise exception 'Old public rate probe row survived cleanup';
  end if;
end;
$verify$;

rollback;
-- Check for a successful execution with no SQL errors, and confirm afterward
-- that neither maintenance-probe scope key remains in the paid quota table.
