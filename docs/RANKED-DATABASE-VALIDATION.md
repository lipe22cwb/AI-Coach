# Ranked database validation (rollback-only, staging)

**Status:** Reviewed against **AI-Coach-Staging**, project `bzjkmiwwrpcshumamkvq`, October 29, 2026 UTC. The _original_ Minesweeper project `squusumcekygqdkaabcm` is **out of scope**. Never link this exercise to production.

## What was verified

Both `202610280001_ranked_gameplay_baseline.sql` and `202610280002_secure_ranked_results.sql` executed inside a single PostgreSQL transaction ending in `ROLLBACK`. Within that transaction, the test exercised first-click protection, 40 mines, safe reveal, visible-board mine privacy, flag/unflag, mine loss, valid chord, real full-board victory, the verified-results trigger, and rejection of forged wins, invalid coordinates and a chord with missing flags. Browser RPC/table permissions and server-only verified-result writes were checked. After rollback, the four Ranked tables and six gameplay RPCs were absent; staging migration history remained unchanged.

This is a database-function smoke test, **not** a complete adversarial, load, concurrency, or browser/API integration test. Board generation is randomized, so rerun for confidence. The test reads an existing staging `auth.users.id` without changing the auth user. No API keys, account credentials, or provider calls are needed. Keep `COACH_PAID_AI_ENABLED=false`.

## Repeat the pre-install test

1. Ensure **AI-Coach-Staging** is the intended project. Verify there are no Ranked tables/functions yet and at least one staging auth user exists. Do **not** run this after Ranked is installed.
2. Run `node scripts/build-ranked-rollback-probe.mjs` in the repository. This **only builds a SQL file** in your operating system's temp directory; it does not connect to a database. The generated file assembles the exact checked-in migrations, removes their top-level transaction delimiters, adds assertions, and wraps everything in one outer `BEGIN ... ROLLBACK`.
3. Review the generated SQL file in full, especially the guard, absence of an intermediate `COMMIT`, final `ROLLBACK`, and database target. The generator rejects unexpected top-level transaction markers.
4. In the **staging SQL editor only**, execute the complete generated SQL as **one script**. On any error, stop execution rather than continuing into unrelated commands. Do not run just the migration sections separately. A successful run returns no rows and no errors.
5. Independently verify the four Ranked tables/functions are absent and that `supabase migration list --linked` still lists both Ranked migrations as local-only.

**Do not** use `supabase db push`, `supabase migration up`, `supabase db reset`, or `supabase migration repair` for Ranked during this smoke test. This runbook does **not** authorize permanent Ranked installation. A separate controlled install and server/API/browser functional test is required. Do not enable paid AI or Supabase Cron as part of this task.
