# Ranked staging installation and HTTP verification

**Scope:** AI-Coach-Staging (`bzjkmiwwrpcshumamkvq`) only. The original Mindsweeper Supabase project (`squusumcekygqdkaabcm`) is **not** part of this deployment. Keep `COACH_PAID_AI_ENABLED=false`. Do not enable paid providers, schedule cleanup, or change the original project.

## Installed on October 29, 2026 UTC

On branch `deployment/ranked-staging-install`, the Supabase CLI was explicitly linked to AI-Coach-Staging and `supabase db push --dry-run --include-all --linked` listed exactly these two pending migrations:

- `202610280001_ranked_gameplay_baseline.sql`
- `202610280002_secure_ranked_results.sql`

The operator applied them using `npx supabase db push --include-all --linked --skip-vault` after reviewing the confirmation prompt. The subsequent migration list showed all **six** local and remote migration versions matched.

This is a record of a **completed staging installation**, not an instruction to rerun the migrations. Earlier documents `STAGING-MIGRATION-ALIGNMENT.md` and `RANKED-DATABASE-VALIDATION.md` describe their respective **pre-install** stages and remain historical; their old "Ranked not installed" statements are no longer the current staging status.

## Database verification

A post-install read-only inspection confirmed:

- All four tables exist: `ranked_matches`, `ranked_match_state`, `ranked_match_moves`, `ranked_verified_results`.
- Six gameplay RPCs exist, and the verified-win trigger is installed.
- All four tables have RLS enabled; `anon` and `authenticated` have no direct table read privileges or Ranked gameplay RPC execution rights.
- The server role can read the verified results but cannot directly insert or update them.
- The existing rollback-only gameplay test **body** was executed against the installed functions inside one transaction, followed by `ROLLBACK`. First-click safety, reveal, flag/unflag, chord, loss, legitimate full clear, verified-result insertion and rejection of forged results passed. A subsequent check confirmed the temporary test matches and moves were not retained.

Do **not** rerun `scripts/build-ranked-rollback-probe.mjs` against this installation: that generator deliberately includes migration creation SQL for a database where Ranked is absent.

## Next.js verification

The operator tested authenticated Ranked gameplay at `http://localhost:3000/ranked`: starting a match, first reveal, flag/unflag, refresh/resume, and chording behaved as expected.

Anonymous HTTP checks on October 29, 2026 UTC returned:

| Check                                               | HTTP | Expected                      |
| --------------------------------------------------- | ---- | ----------------------------- |
| `POST /api/ranked/matches` without cookies          | 401  | Authentication required       |
| Invalid body on `POST /api/ranked/matches/reveal`   | 400  | Invalid input rejected        |
| Cross-origin `POST /api/ranked/matches`             | 403  | Foreign origin rejected       |
| `GET /api/ranked-results?boardSize=16&mineCount=40` | 200  | Verified leaderboard response |
| Legacy `?rows=16&columns=16&mines=40` query         | 400  | Unsupported query rejected    |

The correct `GET` response had `source: "server-verified"`, `boardSize: 16`, `mineCount: 40`, `timing: "server-wall-clock"`, and `results: []`. An empty list is expected until a genuine win is recorded.

## Repeat anonymous HTTP smoke tests

With the **staging-configured** local Next.js development server already running on `http://localhost:3000`:

```bash
node scripts/check-ranked-http.mjs
```

This runs nine anonymous, localhost-only checks. The script does **not** send authentication cookies, API keys, or genuine gameplay moves; it cannot complete a Ranked game. It deliberately rejects remote, HTTPS, or credential-bearing test URLs. Unit tests for its request boundaries run under `npm test` without contacting a server.

## Remaining release blockers

- **Complete a legitimate Ranked win through the authenticated browser/API**, and verify that the database trigger records exactly one official result and `GET /api/ranked-results?boardSize=16&mineCount=40` returns it. A rollback-only database win proves the trigger works internally but does not replace browser/API end-to-end validation.
- Test a second signed-in user attempting to access a different user's match, repeated/replayed moves, malformed and oversized request bodies, and concurrent requests. The current anonymous smoke script does not cover these.
- Review origin-header consistency across start, reveal, flag, and chord routes. Some currently accept absent `Origin` while chord requires it; decide and test an explicit same-site request policy.
- Review app deployment configuration and logging before any public release. The original Mindsweeper project remains off-limits.
- The existing staging security advisor warning about leaked-password protection being disabled is a separate authentication-hardening task. Server-only Ranked tables report RLS enabled with no policies by design.

**Do not** repeat the database push, reset the staging database, or mark any migration repaired as part of HTTP smoke testing.
