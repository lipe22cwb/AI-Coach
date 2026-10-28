# Coaching API

The Coaching tab sends one finished Minesweeper game to `POST /api/coach` and
renders the report that comes back. The endpoint works with no AI provider: a
built-in rule engine replays the game and writes the score, metrics and advice.
When an AI provider is configured, it only rewrites that advice in friendlier
words — it never decides the numbers.

## Endpoint

`POST /api/coach`

Request body — one game (`GameplaySession`):

```json
{
  "game": "minesweeper",
  "difficulty": "Expert",
  "rows": 16,
  "columns": 30,
  "mineCount": 99,
  "outcome": "win",
  "durationSeconds": 38,
  "mines": [5, 9, 23, 24, 35, 36, 58, 65, 69, 72],
  "moves": [
    { "row": 2, "col": 4, "action": "reveal", "atMs": 1200 },
    { "row": 2, "col": 5, "action": "flag" }
  ],
  "preferences": {
    "coachingStyle": "balanced",
    "explanationDetail": "standard",
    "experienceLevel": "some",
    "selectedGoals": ["logic"],
    "customGoal": "",
    "competitiveness": "balanced"
  }
}
```

| Field             | Required | Notes                                                                                                |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `rows`            | yes\*    | Board height, 2–50. Required unless `boardSize` is sent.                                             |
| `columns`         | yes\*    | Board width, 2–50. Expert is 16 rows × 30 columns.                                                   |
| `boardSize`       | legacy   | Shorthand for a square board (`boardSize × boardSize`). Cannot be combined with different rows/cols. |
| `mineCount`       | yes      | Total mines on the board.                                                                            |
| `outcome`         | yes      | `"win"`, `"loss"` or `"in-progress"`.                                                                |
| `moves`           | yes      | Ordered actions, at most 5000. `action` is `reveal`, `flag`, `unflag` or `chord`.                    |
| `mines`           | strongly | Row-major indices of every mine. Must contain exactly `mineCount` unique squares.                    |
| `durationSeconds` | no       | Game length, 0–86400.                                                                                |
| `difficulty`      | no       | Free text such as `"Beginner"` or `"Expert"`.                                                        |
| `moves[].atMs`    | no       | Time of the move in milliseconds from the start; must not go backwards.                              |
| `preferences`     | no       | Saved Settings coaching preferences. Omitted fields use the documented defaults.                     |

Rows and columns are **zero-based**. On a 30-wide board, row 1 column 3 is
index 33.

### Preferences

`preferences` reuses `CoachPreferences` from `lib/settings/types.ts`, the shared
contract in [API-INTEGRATION-CONTRACTS.md](API-INTEGRATION-CONTRACTS.md):

| Field               | Allowed values                                            |
| ------------------- | --------------------------------------------------------- |
| `coachingStyle`     | `encouraging`, `balanced`, `direct`                       |
| `explanationDetail` | `brief`, `standard`, `detailed`                           |
| `experienceLevel`   | `new`, `some`, `experienced`                              |
| `selectedGoals`     | `patterns`, `logic`, `guessing`, `flagging`, `efficiency` |
| `customGoal`        | Any string up to 160 characters                           |
| `competitiveness`   | `relaxed`, `balanced`, `competitive`                      |

Preferences change **wording and emphasis only**. Score, metrics, mistake
classification and game facts stay deterministic. A present but invalid value
returns `400`; a missing field falls back to the Settings default. With the rule
coach, `explanationDetail: "brief"` shortens the bullet lists to two items.

Response — a `CoachResult`:

```json
{
  "report": {
    "headline": "One avoidable click decided this game.",
    "grade": "C",
    "score": 54,
    "summary": "You cleared 73% of the safe squares before move 9 hit a mine, even though 12 provably safe squares were still available.",
    "strengths": ["..."],
    "improvements": ["..."],
    "keyMoment": {
      "moveNumber": 9,
      "row": 4,
      "col": 0,
      "description": "This click hit a mine while 12 provably safe squares were still on the board."
    },
    "nextSteps": ["..."],
    "metrics": {
      "totalMoves": 9,
      "reveals": 3,
      "flags": 6,
      "chords": 0,
      "logicalReveals": 0,
      "guesses": 3,
      "avoidableGuesses": 2,
      "forcedGuesses": 1,
      "guessRate": 1,
      "correctFlags": 6,
      "wrongFlags": 0,
      "flagAccuracy": 1,
      "openingCell": "center"
    },
    "source": "rules",
    "model": null,
    "notes": [
      "The coach replayed the board from the recorded mine layout.",
      "Some squares were proven with overlapping number constraints (patterns such as 1–2–1), not just single numbers.",
      "1 guess was forced — the numbers left no provably safe square at that point.",
      "2 guesses could have been avoided because a provably safe square was still available.",
      "You cleared 52 of 71 safe squares (73%) before the game ended."
    ]
  },
  "fallbackReason": "No AI provider key is configured, so the built-in rule coach answered."
}
```

`report.source` is `rules` when the rule engine wrote the wording, or
`openai` / `anthropic` / `gemini` when a provider did. `report.model` names the
model in that case. `fallbackReason` is set whenever the rules answered for a
reason worth showing the user (no key, or a provider error).

`report.notes` states what the coach could and could not prove: whether the mine
layout was available, whether overlapping constraints were needed, and how many
guesses were forced versus avoidable. The UI shows them under **How this was
analysed**, so a partial read is never presented as certainty.

`metrics.flagAccuracy` is the share of placed flags that sat on real mines. It is
`null` when the player placed no flags, and the UI shows **No flags** — a game
without flags has no flag accuracy to reward.

A loss is scored mainly by how much of the board was actually cleared before the
fatal click: an early loss lands in `D`, a loss around half the board in `C`, and
a late loss in `B` or `A`. Avoidable guesses, wrong flags and clicks on known
mines subtract from that base, so two losses at the same progress can still
differ.

### Guesses: forced versus avoidable

`metrics.guesses` splits into two numbers that are always additive:

- `avoidableGuesses` — a guess made while at least one square was already proven
  safe by the numbers. These are the mistakes that cost points.
- `forcedGuesses` — a guess made when no provably safe square existed, so the
  player had no choice. These do not count against the score.

`avoidableGuesses + forcedGuesses === guesses`.

## Errors and limits

| Status | When                                                                      |
| ------ | ------------------------------------------------------------------------- |
| `400`  | Invalid game data, invalid preferences, or malformed JSON.                |
| `401`  | `COACH_API_TOKEN` is set and the request has no matching token.           |
| `413`  | Body larger than 100 KB.                                                  |
| `429`  | More than 30 POST requests per minute from one client. `retry-after` set. |

The rate limiter is in-memory and per process (`lib/coach/rate-limit.ts`). It is
enough to protect a demo or a single-instance deployment; a multi-instance
deployment should put a shared limiter in front of the endpoint.

Authentication is opt-in so the local demo keeps working: set
`COACH_API_TOKEN` and send it as `Authorization: Bearer <token>` or
`x-coach-token`. Leave it unset and the endpoint stays open.

`GET /api/coach` reports whether a provider is configured, the current limits,
and the sample game used on the page. It is a handy health check and is never
rate limited.

## Configuration

Copy `.env.example` to `.env.local` and set one provider:

| Variable            | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `COACH_PROVIDER`    | `openai`, `anthropic` or `gemini`. Empty auto-picks by key.    |
| `OPENAI_API_KEY`    | OpenAI key.                                                    |
| `ANTHROPIC_API_KEY` | Anthropic key.                                                 |
| `GEMINI_API_KEY`    | Google key (`GOOGLE_API_KEY` also works).                      |
| `COACH_MODEL`       | Optional model override for the chosen provider.               |
| `COACH_TIMEOUT_MS`  | Optional provider timeout before falling back (default 15000). |
| `COACH_API_TOKEN`   | Optional shared secret required on POST when set.              |

## How the analysis works

1. `lib/coach/analyze.ts` replays the board from `mines` using the real row and
   column counts (square or rectangular), applies the standard single-point
   rule, and classifies every click as certain, forced guess or avoidable guess.
2. On top of the single-point rule it compares **overlapping constraints**: when
   one number's unknown squares are a subset of another's, the difference in
   their mine counts decides the extra squares. That solves patterns such as
   1–2–1 and 1–2–2–1, which single-point logic alone cannot. The comparison runs
   as a bounded fixpoint (up to 8 rounds) and is skipped when a board has more
   than 250 live constraints.
3. A deduction only counts while the flags around that number are correct. If a
   number carries a wrong flag, the engine draws **no** conclusion from it, so
   the coach never calls a square "provably safe" on evidence the player did not
   really have.
4. Chording is replayed with the real rule: it only fires on a revealed number
   whose neighbouring flag count equals its value. A chord that opens squares
   which were not provably safe is counted as a guess, not as logic.
5. It scores the game and writes the headline, strengths, improvements, the key
   moment, next steps and the `notes` that state what was proven.
6. `lib/coach/index.ts` sends that brief to the configured provider and keeps the
   deterministic numbers, swapping in the provider's wording for the prose. The
   saved `preferences` shape the system prompt; they never change the brief's
   facts.

## Analysing a real game (Play page)

The Play page no longer relies only on the demo sessions. `MinesweeperBoard`
records every reveal, flag, unflag and chord with an `atMs` timestamp and keeps
the mine layout that was generated, then calls its `onGameComplete` prop once
when the game ends. The clock is derived from wall-clock timestamps rather than
interval ticks, and paused time is excluded from both `atMs` and
`durationSeconds`, so a backgrounded tab cannot make the report disagree with the
timer. `app/page.tsx` stores that `GameplaySession` and renders
`GameCoachReport` under the board, which:

1. loads the saved Settings preferences through the shared
   `SettingsRepository` contract,
2. POSTs the session to `/api/coach` automatically,
3. renders the returned report, or runs the same rule engine in the browser if
   the API cannot be reached.

A rejected request (for example `429` or `400`) is shown as an error, not
silently replaced by a local report — the player never sees coaching that the
server refused to produce.

Starting a new game clears the previous report immediately, and changing
difficulty does the same, so the panel always describes the game that just
finished rather than a stale one.

## Where the files live

| File                          | Role                                       |
| ----------------------------- | ------------------------------------------ |
| `app/api/coach/route.ts`      | HTTP endpoint, limits and auth gate        |
| `app/coaching/page.tsx`       | The Coaching tab                           |
| `components/coach/*`          | Console, report UI and post-game panel     |
| `lib/coach/board.ts`          | Rectangular board geometry and index maths |
| `lib/coach/analyze.ts`        | Rule engine (pure, reusable)               |
| `lib/coach/validate.ts`       | Request validation shared with tests       |
| `lib/coach/preferences.ts`    | Preference parsing and report shaping      |
| `lib/coach/rate-limit.ts`     | In-memory per-client rate limiter          |
| `lib/coach/providers.ts`      | OpenAI / Anthropic / Gemini adapters       |
| `lib/coach/sample-session.ts` | Sample games for the demo                  |
