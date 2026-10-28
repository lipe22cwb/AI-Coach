# API and Data Integration Contracts

This document is the shared integration reference for interfaces that exchange
data with another module, service, or persistence implementation. Add new
interfaces here as they are introduced, and update the matching section when a
contract changes. Keep endpoint-specific details in a linked document when
needed.

## Interface inventory and current status

| Interface                       | Direction                                                     | Current status                                                                              |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Settings preferences repository | Settings UI ↔ persistence adapter                            | Local adapter works; account adapter awaits integration                                     |
| AI Coach API                    | Coaching client → `/api/coach` → AI provider / rules fallback | Merged into `master`; rectangular boards (up to 16 × 30) and coaching preferences supported |
| Ranked results API              | Game client → this app's API → prototype file store           | Implemented as a local prototype                                                            |

## Settings preferences repository

### Purpose and boundary

Settings needs to load and save the player's communication and coaching
preferences. The Settings UI must depend only on the `SettingsRepository`
contract, not on Supabase response objects, authentication details, or database
table structure. The account integration owns user identity, authentication,
remote persistence, and translating remote data to and from this contract.

Registration and sign-in screens are outside the Settings feature. The account
adapter may use the existing account session, but the Settings page does not
pass a user ID or manage that session.

### TypeScript contract

Defined in `lib/settings/types.ts`:

```ts
export type SettingsPreferences = {
  coachingStyle: "encouraging" | "balanced" | "direct";
  explanationDetail: "brief" | "standard" | "detailed";
  experienceLevel: "new" | "some" | "experienced";
  selectedGoals: string[];
  customGoal: string;
  competitiveness: "relaxed" | "balanced" | "competitive";
};

export interface SettingsRepository {
  load(): Promise<SettingsPreferences>;
  save(preferences: SettingsPreferences): Promise<void>;
}
```

The coaching-specific shared type is `CoachPreferences`, also defined in
`lib/settings/types.ts`. Save all Settings through `SettingsRepository`; other
modules can read only the coaching context with
`loadCoachPreferences(repository)` from `lib/settings/coach-preferences.ts`.
The caller passes its configured `SettingsRepository`; the helper returns a
cloned payload, so the caller does not need to know whether preferences came
from local storage or an account adapter:

```ts
const preferences = await loadCoachPreferences(settingsRepository);
await fetch("/api/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...gameplaySession, preferences }),
});
```

The save path remains `settingsRepository.save(fullPreferences)`. The helper is
read-only and does not duplicate or separately persist the coaching fields.

Allowed `selectedGoals` values are `patterns`, `logic`, `guessing`, `flagging`,
and `efficiency`. `customGoal` is limited to 160 characters. Current defaults
are `balanced` coaching style, `standard` explanation detail, `some` experience,
no selected goals, an empty custom goal, and `balanced` competitiveness. See
`lib/settings/defaults.ts` and `lib/settings/repository.ts` for the canonical
runtime validation and defaults.

### Operation behavior

| Operation           | Input                                   | Success result                                                                                | Failure behavior                                                                    |
| ------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `load()`            | None                                    | A complete `SettingsPreferences` object; missing or invalid fields should resolve to defaults | Reject the promise; the UI displays a load error                                    |
| `save(preferences)` | A complete `SettingsPreferences` object | Resolves with `void` after persistence succeeds                                               | Reject the promise; the UI displays a save error and does not mark the values saved |

The adapter must scope account-backed data to the current authenticated user.
The UI must not provide the user ID. The adapter should validate/normalize
persisted data and preserve compatibility when optional or newer fields are
missing. Saving one complete preference object is the repository-level
operation; section-level save/reset behavior is handled by Settings state and
then persisted through this contract.

### Adapter handoff for the account integration

The account-backed implementation should implement `SettingsRepository` and
map its own service/database response into `SettingsPreferences`. Settings
should not inspect that response. The hook already accepts an optional
repository (`useSettingsPreferences(repository?)`) for injection, while its
default currently calls `createSettingsRepository()` in
`lib/settings/repository.ts`. The repository factory also accepts an optional
Supabase client provider for adapter simulation; production callers can omit
it and use the default client provider.

The current repository contains a Supabase-specific account adapter that calls
`auth.getSession()` and reads/writes `user_preferences`. It is an initial
adapter, not a requirement that a future account implementation use Supabase. At
integration time, replace or inject the account-backed adapter while keeping
the `SettingsRepository` contract stable. Keep `createLocalSettingsRepository`
as the local fallback unless the product decision changes.

Expected integration checks:

1. A saved preference object loads back with the same values.
2. A failure from the remote service rejects and reaches the UI error state.
3. The active account sees only its own preferences; another account cannot
   read or overwrite them.
4. The same account can load its preferences in another browser/device.
5. If local-to-account migration is retained, account data takes precedence
   when present, and local data migrates only when no account preference exists.

These account-flow checks require an account/session integration and a
configured persistence environment. They cannot be completed by testing the
Settings UI with local storage alone.

## Ranked results API

The application exposes `app/api/ranked-results/route.ts` to the game client.
This is an internal application API, not a third-party service. Detailed
examples and storage limitations are in `docs/RANKED-RESULTS-API.md`.

### Read leaderboard

`GET /api/ranked-results?boardSize={integer}&mineCount={integer}`

- Both query parameters are required positive integers.
- `boardSize` must be from 2 through 50.
- `mineCount` must be smaller than `boardSize * boardSize`.
- Success (`200`):

```json
{
  "mode": "ranked",
  "boardSize": 16,
  "mineCount": 40,
  "results": [
    {
      "rank": 1,
      "gameId": "7d5ae0b1-09df-4285-a8a6-5d5f8128b712",
      "playerName": "Player",
      "boardSize": 16,
      "mineCount": 40,
      "durationMs": 128450,
      "outcome": "win",
      "id": "server-generated-id",
      "submittedAt": "2026-10-22T12:00:00.000Z"
    }
  ]
}
```

### Submit a Ranked win

`POST /api/ranked-results` with `Content-Type: application/json`:

```json
{
  "gameId": "7d5ae0b1-09df-4285-a8a6-5d5f8128b712",
  "playerName": "Player",
  "boardSize": 16,
  "mineCount": 40,
  "durationMs": 128450,
  "outcome": "win"
}
```

- `gameId`: 8–64 letters, numbers, or hyphens; duplicate submissions return
  the existing result rather than creating another record.
- `playerName`: 2–24 visible characters.
- `boardSize`: integer from 2 through 50.
- `mineCount`: positive integer smaller than the board area.
- `durationMs`: integer from 1 through 86,400,000.
- `outcome`: currently only `"win"` is accepted.
- Created success (`201`) returns `{ "result": RankedResult, "duplicate": false, "rank": number }`.
- Duplicate success (`200`) returns the same shape with `duplicate: true`.
- Invalid input returns `400` with `{ "error": string }`; unexpected storage
  failure returns `500` with a generic error message.

The current implementation stores results in `data/ranked-results.json`; it is
a single-process local prototype and does not verify player identity or game
replays. Do not treat `playerName` as an authenticated account identity.

## AI Coach API

### Implementation

`POST /api/coach` accepts one `GameplaySession`: board dimensions (`rows` and
`columns`, or the legacy square `boardSize`), mine count, outcome, moves, and
optional game, difficulty, mine layout, duration and `preferences`. The server
validates the request (`lib/coach/validate.ts`), replays the game
(`lib/coach/analyze.ts`) and returns a `CoachResult`. The full request and
response schema lives in [COACH-API.md](COACH-API.md).

Boards are rectangular. Expert is 16 rows × 30 columns, so `rows` and `columns`
are the canonical fields; `boardSize` remains square-board shorthand and may not
contradict them.

### Coaching personality compatibility

**Supported.** `preferences` is optional and validated against the shared
`CoachPreferences` shape. The fields shape the AI system prompt
(`lib/coach/prompt.ts`) and, for `explanationDetail: "brief"`, the number of
bullets in the rule report. They never change deterministic analysis, score,
metrics, game facts, mistake classification or report evidence.

Missing fields fall back to the Settings defaults. Invalid enum values return
`400` rather than being silently accepted.

### Validation and limits

- `mines`, when present, must contain exactly `mineCount` unique in-range
  indices, so a report is never built on a layout that contradicts its count.
- Moves must be inside the board, at most 5000, and `atMs` timestamps may not go
  backwards.
- Bodies are limited to 100 KB; POST is limited to 30 requests per minute per
  client; an optional `COACH_API_TOKEN` adds a shared-secret gate.
- A deduction is only drawn from a number whose adjacent flags are all correct,
  so a wrong flag can never make the coach call a square provably safe.
- A chord only fires on a revealed number whose neighbouring flag count equals
  its value, matching the playable board.
- Overlapping number constraints (patterns such as 1–2–1) are compared in
  addition to single-point rules, so more squares are proven without guessing.
- `metrics.forcedGuesses` and `metrics.avoidableGuesses` add up to
  `metrics.guesses`; `report.notes` states what was proven and what was not.

### Real games from the Play page

The Play page now sends real completed games. `MinesweeperBoard` records every
action with an `atMs` timestamp and keeps the generated mine layout, then emits
one `GameplaySession` through its `onGameComplete` prop when the game ends.
`app/page.tsx` renders `GameCoachReport` under the board, which posts the session
to `/api/coach` automatically and shows the report. Nothing else in the app needs
to build a session by hand; the Coaching tab keeps its two demo games.

### Integration checks

1. A rectangular Expert (16 × 30) game returns a report with metrics.
2. A legacy square payload (`boardSize`) is still accepted.
3. `mines` that do not match `mineCount` return `400`.
4. An invalid preference value returns `400`.
5. `explanationDetail: "brief"` shortens each bullet list to two items.
6. A chord with a mismatched flag count is ignored, and wrong flags never
   produce a "provably safe" claim.
7. A 1–2–1 board proves extra squares through overlapping constraints.
8. A finished game on the Play page renders a report without any manual step.

## Adding or changing an interface

For each new interface, add its purpose, direction, operation names and paths,
request/input schema, response/output schema, validation, error behavior,
authentication/identity boundary, persistence assumptions, and integration
checks. Link a focused detail document if the contract is large. Update this
document whenever an existing contract changes so it remains the shared source
for cross-module handoffs.
