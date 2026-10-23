# API and Data Integration Contracts

This document is the shared integration reference for interfaces that exchange
data with another module, service, or persistence implementation. Add new
interfaces here as they are introduced, and update the matching section when a
contract changes. Keep endpoint-specific details in a linked document when
needed.

## Interface inventory and current status

| Interface                       | Direction                                                     | Current status                                                                                                         |
| ------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Settings preferences repository | Settings UI ↔ persistence adapter                            | Local adapter works; account adapter awaits integration                                                                |
| AI Coach API                    | Coaching client → `/api/coach` → AI provider / rules fallback | Present on `origin/Luiz-Branch` (`71c2d2f`); not merged into this branch; coaching personality is not configurable yet |
| Ranked results API              | Game client → this app's API → prototype file store           | Implemented as a local prototype                                                                                       |

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

## AI Coach API — branch review

### Reviewed implementation

Reviewed `origin/Luiz-Branch` at commit `71c2d2f` (`Keep the coaching work log
local only`). This API exists on that branch and is not present in the current
working branch until the branches are merged.

The branch exposes `POST /api/coach`. Its request currently accepts one
`GameplaySession`: board size, mine count, outcome, moves, and optional game,
difficulty, mine layout, and duration. The server validates and analyzes that
game, then returns a `CoachResult` containing the report and fallback reason.
See `docs/COACH-API.md` on the source branch for its full request/response schema.

### Coaching personality compatibility

**Current result: not supported yet.** The Coach API request has no
`preferences` field, and `parseSession()` in `app/api/coach/route.ts`
reconstructs the accepted fields, so coaching preferences sent today would be
discarded.
`lib/coach/prompt.ts` also hard-codes an encouraging voice in
`COACH_SYSTEM_PROMPT`. Therefore, the existing endpoint cannot honor the
Settings choices for tone, explanation detail, experience, goals, or
competitiveness.

### Suggested API extension

When connecting Settings to the AI report flow, add an optional, validated
`preferences` object to the Coach API request. Reuse the shared `CoachPreferences`
shape:

```ts
type CoachRequest = GameplaySession & {
  preferences?: CoachPreferences; // Omitted fields use documented defaults.
};
```

Validate the preference enums and normalize missing fields to the Settings
defaults. The AI prompt should use preferences to adjust wording and emphasis
only. They must not change deterministic analysis, score, metrics, game facts,
mistake classification, or report evidence. The response can retain the
existing `CoachResult` shape; preferences do not need to be echoed unless
needed for diagnostics. Invalid enum values should produce `400` rather than
being silently accepted.

This is a proposed integration contract, not an implemented feature. Confirm
the optional field and default when the source branch is integrated. The Coach API should receive the saved preference from the Coaching
client; account identity and preference persistence remain separate concerns.

## Adding or changing an interface

For each new interface, add its purpose, direction, operation names and paths,
request/input schema, response/output schema, validation, error behavior,
authentication/identity boundary, persistence assumptions, and integration
checks. Link a focused detail document if the contract is large. Update this
document whenever an existing contract changes so it remains the shared source
for cross-module handoffs.
