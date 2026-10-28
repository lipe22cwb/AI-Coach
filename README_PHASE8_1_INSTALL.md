# Phase 8.1 — Trust & CI Fixes

**Project:** INTP302 AI-Coach (Next.js website) — `Ian-Branch`  
**Based on:** GitHub commit `f980e5c40794c4d8d88963d03dd3322af8e9a48d`  
**Scope:** Strengthen verified Practice coaching input validation and run all gameplay tests on every GitHub push/PR. No AI provider key required.

## Files included

| File                                  | Change  | Purpose                                                                                                                                   |
| ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/coach/verified-focus-input.ts`   | New     | Validates a checkpoint-stamped Practice session and verifies its replay _before_ AI selection                                             |
| `app/api/coach/verified/route.ts`     | Replace | Uses the shared Phase 6 input validator and refuses bad recordings before contacting any AI service; adds no-store and origin/size checks |
| `tests/verified-focus-input.test.mjs` | New     | Nine focused regression tests for valid records and rejection cases                                                                       |
| `scripts/smoke-verified-focus.mjs`    | New     | Eight live HTTP checks for the focus route in rules-only mode                                                                             |
| `package.json`                        | Replace | Adds `npm test` script covering every `tests/*.test.mjs` file; all dependency versions are unchanged                                      |
| `.github/workflows/check.yml`         | Replace | Runs `npm test` automatically before the Next.js build on pushes and pull requests                                                        |

## Install

1. Open your existing `C:\INTP302\Ai-Coach` project in VS Code.
2. Ensure `git branch --show-current` prints `Ian-Branch` and review `git status` before copying.
3. Extract this ZIP **into the project root**, preserving folder names. Accept the replacement of the three existing files. **Do not delete or replace any other project files.**
4. From Git Bash in the project root:

```bash
npx prettier . --write
npm test
npm run check
```

**Expected unit test total:** 151 passing tests (142 existing + 9 new).

5. Start your website in one terminal:

```bash
npm run dev
```

6. In a second Git Bash terminal, run:

```bash
node scripts/smoke-verified-focus.mjs
```

**Expected result with no AI provider configured:** `8/8 verified-focus HTTP checks passed`. The test checks a valid Practice game, missing/mismatching checkpoints, wrong outcome, Ranked-mode rejection, malformed JSON, cross-origin request rejection, and oversized input.

If an AI provider is configured, the HTTP smoke script **skips instead of making a potentially billable model call**. To do the full smoke test, use a rules-only development environment. Never share or commit an API key.

7. Test in the browser: complete a new Practice game; open Coaching; click **Ask AI to choose a focus**. It should still return the rule-selected focus while no provider is configured.
8. When tests pass, review `git status --short` and `git diff`, then commit and push `Ian-Branch` yourself. GitHub Actions should now run `npm test` on every push. If CI fails, read its failing test rather than bypassing the step.

## Why this matters

`/api/coach/verified-brief` already used a strict parser requiring every move's `afterHash` and timestamp. The focus-selection endpoint previously had a separate, weaker parser. Phase 8.1 makes both use **`parseVerifiedPracticeRecording`**, and requires verified replay/outcome checks before AI focus selection. This does **not** authenticate client recordings or make them safe for Ranked scoring.

GitHub Actions previously checked formatting, build and TypeScript only. The new CI step protects the deterministic coaching tests from accidental regressions as teammates merge branches.

## Remaining limitations

- Client-side Practice recordings/checksums are not cryptographic proof and can be forged; use neither for Ranked results.
- The focus endpoint is not yet authenticated or rate-limited; **do not expose billable AI usage publicly until access controls and abuse limits are designed**.
- The UI may still display rule-based summaries for older local recordings without checkpoints, but the AI-focus API will reject those legacy recordings. Finish a fresh game if you see a validation error.
- No API provider is configured or called by these new tests. Supabase and Ranked code are unchanged.

## Validation performed when creating this package

- **151/151 isolated Node automated tests passed** against the existing Phase 6–7 replay, report, and reference-game sources.
- TypeScript check passed for the new input validator against those shared modules.
- **8/8 direct-route request cases passed** with the actual new route code in a local test harness using a mock no-provider adapter.
- Full Next.js production build and live localhost integration must still be run in your development environment.
