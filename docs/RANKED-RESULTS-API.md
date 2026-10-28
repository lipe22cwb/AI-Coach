# Ranked Results API — authenticated, database-verified matches

## Status

The Next.js application already blocks arbitrary Ranked submissions. It does not trust client-supplied `durationMs`, `outcome`, `playerName`, or `gameId`. The legacy `data/ranked-results.json` leaderboard and its write helpers are disabled.

The **revised, not-yet-applied** migration `supabase/migrations/202610280002_secure_ranked_results.sql` connects real server-verified Ranked wins to a shared PostgreSQL results table. It was adapted to the **Mindsweeper** project's live database schema, but requires a safe database deployment and end-to-end confirmation before the leaderboard is considered available.

## How a real Ranked win gets recorded

1. The signed-in player sends moves to the Next.js Ranked API, which verifies their Supabase identity.
2. Next.js invokes privileged PostgreSQL functions using a server-only secret key. These functions are not callable by `anon` or `authenticated` PostgreSQL roles.
3. The first reveal sets `public.ranked_matches.started_at` using the PostgreSQL server clock. `reveal_ranked_cell` and `chord_ranked_cell` calculate wins after all 216 safe squares of the 16×16/40-mine board have opened; they set `status = 'won'`, `finished_at`, and `duration_ms` themselves.
4. A trigger installed by the revised migration runs only on the `active → won` transition. Before writing one `ranked_verified_results` row, it checks the existing server-calculated time and validates the actual board state (40 distinct in-range mines, 216 distinct in-range revealed non-mines).
5. The public `GET /api/ranked-results?boardSize=16&mineCount=40` uses the server-only Supabase client to read up to 50 fastest verified results. It never falls back to JSON or claimed client scores.

**Official timer:** from _first reveal_ until victory, as measured by the existing database functions. Time spent away after beginning a match is included. The migration does **not** create a match-creation timer.

**No backfill:** older matches are not automatically inserted into the verified leaderboard; only victories completed after migration deployment generate results.

## Endpoint behavior

- `GET /api/ranked-results?boardSize=16&mineCount=40` — read-only. Returns 503 until the verified results table exists and can be queried. An empty `results: []` means the table is available but has no verified wins yet.
- `POST /api/ranked-results` — _never_ records a win. Returns 401 for unsigned callers (when auth works), 409 for signed-in callers, 403 for disallowed origins, and 503 when auth is unavailable.
- Ranked board RPCs — privileged server-side only; no direct Data API access for browser roles.

Public GET format:

```json
{
  "mode": "ranked",
  "source": "server-verified",
  "boardSize": 16,
  "mineCount": 40,
  "timing": "server-wall-clock",
  "results": [{ "rank": 1, "durationMs": 81500, "finishedAt": "2026-10-28T08:10:00Z" }]
}
```

The results list is a best-matches table, **not** a per-player rating or unique-player leaderboard. User IDs, emails, and internal match IDs are not returned.

## Database deployment safeguards

The migration must be applied only once, after reviewing and testing it against a **staging** copy or safe development environment. It:

- Requires all three Ranked source tables and the six currently deployed gameplay functions.
- Refuses to run if the old `ranked_match_timing` table or a pre-existing `ranked_verified_results` table exists (preventing silent mixing of timer designs).
- Enables RLS, revokes direct access to Ranked tables from `PUBLIC`, `anon` and `authenticated`, and explicitly preserves the gameplay tables' privileges for `service_role`.
- Revokes execution of privileged Ranked RPCs from browser roles and grants it to `service_role`.
- Grants **SELECT only** on verified results to the privileged API role; only the locked-down trigger inserts results.
- Can reject an invalid supposed victory with an exception, which rolls the status update back. Test both reveal-completion and chord-completion paths in staging before using in production.

### Validation sequence after approval

1. Back up the current project and install migration in a development/staging database first. Confirm no existing game features break.
2. Verify 6 Ranked functions remain executable for `service_role` and unavailable to `anon`/`authenticated`. Verify source tables and results table are also inaccessible directly to those roles.
3. Complete a real Ranked game via reveal actions. Check exactly one verified row is written; compare `duration_ms` and `finished_at` to the source match.
4. Verify completing a game through a **chord** also works. Confirm a loss makes no verified row.
5. Replay/retry requests and attempt direct fake JSON submissions; verify they never create additional results.
6. Confirm a public GET returns only verified wins (no legacy JSON data). Run Supabase security advisors after deployment.

Do not fake a production win just to test the trigger. Use staging for test data and a real game for production confirmation. Do not expose server-only `SUPABASE_SECRET_KEY`.
