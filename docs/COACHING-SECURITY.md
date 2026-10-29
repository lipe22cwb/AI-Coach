# Coaching API security — proposed rollout

## Security model

- The rule-based coach and verified deterministic brief remain usable by guests without provider keys. They are NOT billed calls.
- **Paid AI is disabled by default**, even if `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` is configured.
- Paid AI requires ALL of: `COACH_PAID_AI_ENABLED=true`, a configured model provider, a valid Supabase session checked via `auth.getUser()`, and an atomic successful reservation from `reserve_coach_ai_request`.
- Every paid entrypoint (`POST /api/coach` and `POST /api/coach/verified`) shares the SAME database-backed quota: max **3/minute/user**, **10/day/user**, **200/day globally** (UTC). Unauthenticated users, outages, and exhausted quotas get deterministic rule output instead.
- These limits count **requests reserved** rather than precise consumed tokens, so they are NOT a monetary cap. Before enabling paid AI, configure the provider's billing budget/alerts and restrict the permitted model and keys at the provider.
- Provider requests cap output to 512 tokens and timeouts to at most 15 seconds. Inputs have server-side character limits. Provider errors are not reflected to the browser.
- JSON body limits are enforced on a stream while reading: 100 KB for legacy coaching, 200 KB for verified recording routes. Oversized bodies are rejected even with a forged Content-Length. POST rejects cross-origin requests.
- Never derive authentication or rate-limit identity from `x-forwarded-for` or caller-supplied user IDs. The user ID comes solely from the verified Supabase session.

## Required staged deployment order

1. Use a **new feature branch**, review changes, and run `npm run check` and `npm test` locally.
2. Review and apply `supabase/migrations/20261029003832_coach_paid_quota.sql` in a STAGING project first. Verify `reserve_coach_ai_request` is callable by `service_role` only, never by `anon` or `authenticated`.
3. Confirm two different users have independent per-user counters and both share the global counter. Test simultaneous requests against the database function; demonstrate at most 3 per minute, 10 per day, 200 globally.
4. Keep `COACH_PAID_AI_ENABLED` unset or `false` until database tests and security review finish. With it false, confirm no paid provider requests are sent, even if provider keys exist.
5. Configure provider billing hard limits, alerts, restricted keys/models, and environment secrets server-side. Only then set `COACH_PAID_AI_ENABLED=true` on the server and test both paid endpoints with authenticated users.
6. Verify guest Practice still shows rule Coaching and no provider calls, including failures/quota exhaustion. Test API errors do not reveal upstream response bodies.
7. Add production edge/WAF request-rate controls and monitoring. Public **rule-only** routes still consume CPU, and application quotas alone do not prevent network-level denial-of-service attacks.
8. Set up a database housekeeping job to remove expired minute/day counters (e.g. older than 30 days) after safe operational review. Do not run destructive cleanup automatically.

## Current limitations

- Paid AI is **explicitly opt-in**, not automatically production-ready after installing files.
- Quotas are a bound on request counts, not actual USD costs. Provider billing controls are mandatory.
- Guest deterministic endpoints remain public; deploy an edge-level abuse/traffic limit separately.
- The older `/api/coach` narrative interface still accepts AI-authored wording when authorized. The newer verified focus path has stricter evidence constraints. Unifying these is a separate product/security task.
- This migration is NOT applied by the patch installer. Do not execute it directly against an existing project without reviewing migration history and staging tests.
