# Ranked Results API — verified, server-only results

## Security model

**No browser can submit a Ranked win, outcome, or elapsed time.** The legacy
`data/ranked-results.json` store is deprecated and ignored; its former write
helpers now fail closed. `POST /api/ranked-results` authenticates the caller
when configured but **always rejects** a client-supplied result (401 if signed
out, 409 if signed in, 503 if auth is unavailable). The browser continues to
play through the authenticated, server-controlled Ranked match RPC routes.

A winning result is created automatically **inside PostgreSQL** only when an
existing server-controlled `ranked_matches` row changes from another status to
`won`. The server creates the match's start time in the database at INSERT and
calculates its finish time from the database clock. Each result is unique by
`match_id`. Clients cannot control the time or write results through Data API.

**Important deployment prerequisite:** The teammate's deployed Ranked RPCs
must actually set `public.ranked_matches.status = 'won'` only after validating
a completed winning board. The RPC source and database schema are not included
in the repository; confirm this directly with the teammate before applying
`supabase/migrations/202610280002_secure_ranked_results.sql`.

The migration also revokes direct browser access to the match and timing tables
and revokes public execution of the six known privileged Ranked RPCs that
accept user IDs. These are called by Next.js using its **server-only** Supabase
secret, which remains authorized. Review whether any other client depends on
direct access before deploying.

If the migration hasn't been applied or the database is unreachable, the GET
endpoint responds 503. It never falls back to an unverified leaderboard.

## Read the fastest verified matches

`GET /api/ranked-results?boardSize=16&mineCount=40`

This read-only public endpoint supports the existing Intermediate 16x16 / 40
mine configuration. The response is shaped as:

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

Up to 50 best verified **matches** are returned. The public response does
not reveal authentication user IDs, emails, or internal match IDs. Multiple
wins by the same player can appear because this is not yet a per-player rank
system. Public results do not require sign-in; **creating a ranked match does**.

The time uses the DB clock from **match creation to winning outcome**, not
active gameplay time. This includes time spent away from the match; it is an
honest, tamper-resistant prototype metric, but it is not necessarily suitable
for competitive speed rankings without an agreed pause/reconnect policy.

## Write endpoint

`POST /api/ranked-results` is permanently disabled for arbitrary result data.

- `401`: unsigned player (where auth is configured)
- `409`: signed-in player tried to submit a result; game RPCs own finalization
- `503`: authentication not configured or temporarily unavailable
- `403`: wrong Origin (cross-site submission)

No `durationMs`, `outcome`, `playerName`, or `gameId` received from a browser
can change the leaderboard.

## Deployment checklist for the Supabase owner

1. Verify `ranked_matches` has `id uuid`, `user_id uuid`, `status` and that
   `ranked_match_state` exists. Confirm only server-owned RPCs can transition
   status to `won`, and that the transition actually occurs in `ranked_matches`.
2. Confirm the listed six Ranked RPCs are only called from the privileged
   Next.js backend. The migration revokes anonymous and user-level direct RPC
   execution and raw table access.
3. Back up the database and apply the migration in a staging Supabase project.
   **Do not run it against the team's shared project without approval.**
4. Test an anonymous direct read/write to `ranked_matches`,
   `ranked_match_state`, `ranked_match_timing`, and
   `ranked_verified_results`: all must be denied. Call the protected RPCs as
   `anon` and `authenticated`: they must also be denied.
5. Sign in normally and play a new Ranked match to a legitimate win. Confirm
   exactly one `ranked_verified_results` row appears for that match and the
   public GET returns the time. Test a real loss: no result must be created.
6. Replay the final move or try submitting the same win repeatedly: still one
   row per match. Confirm there are no old/fake JSON-file results in the GET.
7. Verify the server-only `SUPABASE_SECRET_KEY` is correctly configured and
   never exposed to browsers or source control.

**Legacy matches:** the database timer begins at match INSERT after the
migration. No old wins or matches already underway are backfilled, because
reliable start times are unknown.

**Next work if needed:** per-player best results, meaningful competitive rank
points, pause-adjusted times, abuse protection, and integration tests against
the real Supabase project. Do not claim any of these are implemented here.
