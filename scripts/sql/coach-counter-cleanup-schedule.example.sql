-- OPTIONAL EXAMPLE ONLY: DO NOT RUN UNTIL STAGING IS REVIEWED.
-- First enable Supabase Cron / pg_cron in your STAGING dashboard.
-- Ensure the scheduled job owner is the privileged database owner, not an
-- anonymous or application role. The job runs daily at 03:15 UTC.
-- This schedules REAL recurring deletion of records older than 30 days.
select cron.schedule(
  'ai-coach-expired-counter-cleanup',
  '15 3 * * *',
  $$select * from coach_maintenance.cleanup_old_coach_counters();$$
);

-- To disable the schedule later:
-- select cron.unschedule('ai-coach-expired-counter-cleanup');
