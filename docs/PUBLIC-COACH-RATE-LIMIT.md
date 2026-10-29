# Public Coaching API global admission limiter (staging-first)

## What this protects

When explicitly enabled, all POST requests to `/api/coach`, `/api/coach/verified`,
and `/api/coach/verified-brief` share **120 requests per UTC minute** (all users
combined, not 120 each). The first 120 in a minute are allowed, subsequent requests
receive HTTP 429 and `Retry-After: 60`. Requests across multiple Next.js processes
share the same atomic PostgreSQL counter; no forwarded IP headers are trusted.
Cross-origin requests are rejected before database work. This gate runs before JSON
replay/Coaching calculations and before paid AI quota reservation.

If enabled but the database or RPC is unavailable, requests fail closed with
HTTP 503 (`Retry-After: 5`). A global limit can prevent legitimate users from
accessing Coaching during a traffic spike and an attacker could use up the
shared allowance; this is only an **aggregate resource cap**, not identity-based
abuse protection. It also consumes database resources on every request.

## Install and test in staging (do not run against the original production project)

1. Review `scripts/sql/public-coach-global-rate-limit.sql`. Create a migration
   filename using `supabase migration new public_coach_global_rate_limit` (check
   `supabase --help` and your installed CLI version first); copy the reviewed SQL
   into the CLI-generated migration. Do not invent the migration timestamp.
2. Apply in **AI-Coach-Staging** only, using your normal reviewed migration process.
   Confirm `anon` and `authenticated` cannot call the function or access counters.
3. Keep `COACH_PAID_AI_ENABLED=false` and set
   `COACH_PUBLIC_RATE_LIMIT_ENABLED=true` **only for the staging server**.
4. Verify valid POSTs return 200 within quota, and excessive requests return 429.
   Test concurrency safely within your staging capacity; verify free/paid rules
   are not invoked after a rate-limit denial.
5. Stop staging, restore `COACH_PUBLIC_RATE_LIMIT_ENABLED=false`, and run
   `npm run check` and `npm test` before merging/deployment.

The feature flag is OFF by default so local development and existing deployments
continue to work until the migration is installed. Never enable the flag without
first installing the matching SQL migration in the target database.

## Important remaining deployment work

- Add edge/WAF per-client request limits at the actual public ingress (hosting
  provider not yet chosen). These block abusive traffic before it reaches Next.js
  **or the database**. Don't trust arbitrary `x-forwarded-for` headers at the app.
- Confirm the platform cannot bypass the WAF by directly hitting the origin.
- Add monitoring/alerting, 429/503 metrics, and quota counter housekeeping.
- This shared global limiter is separate from the stricter authenticated paid AI
  quota (3/min/user, 10/day/user, 200/day globally) and monetary provider budgets.
