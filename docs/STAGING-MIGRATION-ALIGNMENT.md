# AI-Coach staging migration alignment (NOT a deployment instruction)

## Scope and non-negotiable boundary

This document concerns **AI-Coach-Staging**, project ref `bzjkmiwwrpcshumamkvq`, only. Do **not** link, push, reset, repair, or apply any SQL to the original Mindsweeper project `squusumcekygqdkaabcm`.

Keep `COACH_PAID_AI_ENABLED=false`. This change neither enables AI providers nor creates a Cron job.

## Recorded history, verified October 29, 2026 (UTC)

| Migration                | Git history                                                                | Staging migration-history version               | Staging objects               |
| ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------- |
| Account preferences      | `202610220001_account_preferences.sql`                                     | `202610220001` (repaired from `20261029023220`) | Exists (3 policies + trigger) |
| Ranked gameplay baseline | `202610280001_ranked_gameplay_baseline.sql`                                | **Not installed**                               | Absent                        |
| Secure Ranked results    | `202610280002_secure_ranked_results.sql`                                   | **Not installed**                               | Absent                        |
| Paid AI quota            | `20261029003832_coach_paid_quota.sql`                                      | `20261029003832`                                | Exists                        |
| Shared public rate limit | `20261029021535_public_coach_global_rate_limit.sql` (added in this change) | `20261029021535`                                | Exists                        |
| Private counter cleanup  | `20261029024138_coach_counter_cleanup.sql` (added in this change)          | `20261029024138`                                | Exists                        |

**The two newly tracked migration files use versions already registered by Supabase in staging.** They are historical backfills, not newly generated migrations and not instructions to reapply their SQL to staging.

The older file `202610220001_account_preferences.sql` is retained so we do not silently rewrite history used by another Supabase project or contributor.

## Account-history repair completed (October 29, 2026 UTC)

The account-preferences migration history has been successfully reconciled in AI-Coach-Staging (`bzjkmiwwrpcshumamkvq`).

The existing `user_preferences` table, constraints, foreign key, three user-specific RLS policies, and update trigger were verified before the repair.

The following commands were executed successfully against staging and are recorded for documentation purposes only:

```bash
npx supabase migration repair 202610220001 --status applied --linked
npx supabase migration repair 20261029023220 --status reverted --linked
npx supabase migration list --linked
```

The final migration list confirms that all four installed migrations match their local versions.

These commands changed migration history only. No existing tables were recreated or deleted.

The two Ranked migrations remain unapplied and must be tested separately before deployment. Do not repeat the repair commands.

## Ranked baseline corrections in this change

`202610280001_ranked_gameplay_baseline.sql` originally had six corrupted references to `flagged_positions` / `first_move_done`.

The corrected SQL is still **not installed** in staging. Its stored functions must be end-to-end validated there, including reveal, flag/unflag, chord, verified victory and loss, before treating Ranked as available or running a full schema push.

## Deliberate remaining block

Do **not** run `supabase db push`, `supabase db reset`, `supabase migration up` against a linked remote, or attempt to repair the Ranked migrations until a separate reviewed Ranked-installation/staging-test plan exists.

Account history alignment and the two tracked snapshots do not imply Ranked works.

## Source guidance

Supabase documents `migration repair` as a **history-only** action:

https://supabase.com/docs/reference/cli/supabase-migration-repair
