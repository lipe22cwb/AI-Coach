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
  "difficulty": "Beginner",
  "boardSize": 9,
  "mineCount": 10,
  "outcome": "win",
  "durationSeconds": 38,
  "mines": [5, 9, 23, 24, 35, 36, 58, 65, 69, 72],
  "moves": [
    { "row": 2, "col": 4, "action": "reveal" },
    { "row": 2, "col": 5, "action": "flag" }
  ]
}
```

| Field             | Required | Notes                                                                         |
| ----------------- | -------- | ----------------------------------------------------------------------------- |
| `boardSize`       | yes      | The board is square: `boardSize × boardSize`, between 2 and 50.               |
| `mineCount`       | yes      | Total mines on the board.                                                     |
| `outcome`         | yes      | `"win"`, `"loss"` or `"in-progress"`.                                         |
| `moves`           | yes      | Ordered actions. `action` is `reveal`, `flag`, `unflag` or `chord`.           |
| `mines`           | strongly | Row-major indices of every mine. Without it the coach cannot judge decisions. |
| `durationSeconds` | no       | Game length.                                                                  |
| `difficulty`      | no       | Free text such as `"Beginner"`.                                               |
| `moves[].atMs`    | no       | Time of the move, in milliseconds from the start.                             |

Rows and columns are **zero-based**. On a 9-wide board, row 1 column 3 is index 12.

Response — a `CoachResult`:

```json
{
  "report": {
    "headline": "One avoidable click decided this game.",
    "grade": "C",
    "score": 60,
    "summary": "...",
    "strengths": ["..."],
    "improvements": ["..."],
    "keyMoment": {
      "moveNumber": 9,
      "row": 4,
      "col": 0,
      "description": "This click hit a mine while 3 provably safe squares were still on the board."
    },
    "nextSteps": ["..."],
    "metrics": {
      "totalMoves": 9,
      "reveals": 3,
      "flags": 6,
      "chords": 0,
      "logicalReveals": 0,
      "guesses": 3,
      "avoidableGuesses": 1,
      "guessRate": 1,
      "correctFlags": 0,
      "wrongFlags": 0,
      "flagAccuracy": 1,
      "openingCell": "center"
    },
    "source": "rules",
    "model": null
  },
  "fallbackReason": "No AI provider key is configured, so the built-in rule coach answered."
}
```

`report.source` is `rules` when the rule engine wrote the wording, or
`openai` / `anthropic` / `gemini` when a provider did. `report.model` names the
model in that case. `fallbackReason` is set whenever the rules answered for a
reason worth showing the user (no key, or a provider error).

Bad input returns `400` with `{ "error": "..." }`.

`GET /api/coach` reports whether a provider is configured and returns the sample
game used on the page. It is a handy health check.

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

## How the analysis works

1. `lib/coach/analyze.ts` replays the board from `mines`, applies the standard
   single-point rule (a number with all its flags placed proves its other
   neighbours safe; a number with no flags left proves they are mines), and
   classifies every click as certain, forced guess or avoidable guess.
2. It scores the game and writes the headline, strengths, improvements, the key
   moment and next steps.
3. `lib/coach/index.ts` sends that brief to the configured provider and keeps the
   deterministic numbers, swapping in the provider's wording for the prose.

## Where the files live

| File                          | Role                                 |
| ----------------------------- | ------------------------------------ |
| `app/api/coach/route.ts`      | HTTP endpoint and input validation   |
| `app/coaching/page.tsx`       | The Coaching tab                     |
| `components/coach/*`          | Console and report UI                |
| `lib/coach/analyze.ts`        | Rule engine (pure, reusable)         |
| `lib/coach/providers.ts`      | OpenAI / Anthropic / Gemini adapters |
| `lib/coach/sample-session.ts` | Sample games for the demo            |
