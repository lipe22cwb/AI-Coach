# Coaching counter cleanup — staging-first plan

The paid AI quota and public Coaching rate-limit tables retain minute/day
reservations indefinitely unless cleaned. These are **usage counters, not user
preferences, gameplay data, or an accounting ledger**. The existing paid quota
limits still apply to active buckets.

## Proposed behavior

- Keep records for **30 days**. Only rows where `bucket_start` is strictly older
  than the current transaction time minus 30 days are eligible.
- At most **5,000 rows per table** are removed per invocation to bound work.
- The function uses `SECURITY INVOKER` in a private `coach_maintenance` schema;
  browser roles and `service_role` have no access. A reviewed database-owner
  schedule can call it later.
- The SQL installs the function and index, but **does not delete rows or enable a
  schedule** until the function is explicitly invoked.
- The optional Supabase Cron schedule is **not installed automatically**.

## Staging procedure

1. Confirm the connected Supabase project is **AI-Coach-Staging** and review both
   table names, the retention period, privileges, and the current schema.
2. **Reconcile migration history first.** Staging has some migrations registered
   under different timestamps than the checked-in SQL files. Do not blindly run
   `supabase db push` or regenerate migration timestamps until this is reviewed.
3. After reconciliation, generate a _new_ migration file with your installed
   Supabase CLI (check `supabase migration --help` first). Copy the contents of
   `scripts/sql/coach-counter-cleanup.sql` into that CLI-generated file.
4. Apply **to staging only** via the reviewed migration process. Confirm the
   function exists in the private schema and is not callable by `anon`,
   `authenticated`, or `service_role`.
5. Run `scripts/sql/coach-counter-cleanup-staging-probe.sql` as a single script in
   the staging SQL Editor. This uses synthetic rows and an explicit `ROLLBACK`.
   Verify that the script completes without errors, then check that no probe
   rows remain. This test may **temporarily delete expired real rows inside a
   transaction**, but rolls everything back.
6. Query the real tables to confirm current buckets remain unchanged. Review
   `scripts/sql/coach-counter-cleanup-schedule.example.sql` and provider Cron
   documentation before separately enabling the optional daily job.

## Not yet authorized / not included

- No production database modification.
- No deletion of real counter data outside the rollback-only probe.
- No `pg_cron` extension installation, recurring job, or automatic cleanup.
- No application API route changes or API keys.

## Operational notes

A 30-day retention policy is a housekeeping decision, not a security audit trail.
Record relevant aggregate usage metrics separately if longer-term reporting is
needed. The batch size is chosen to keep work bounded and may leave expired
rows behind if a backlog exceeds 5,000 rows per table; later runs continue.

If scheduling, review job history and alerts after deployment. The cron extension
stores its own job history and requires independent housekeeping. See the
[Supabase Cron documentation](https://supabase.com/docs/guides/cron) and
[quickstart](https://supabase.com/docs/guides/cron/quickstart).
