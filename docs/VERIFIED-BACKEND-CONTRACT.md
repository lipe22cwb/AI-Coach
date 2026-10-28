# Phase 6 — Verified AI Backend Contract (v1)

This feature prepares the INTP302 AI-Coach website to work with a future Python FastAPI (or other AI) server. **It does not call an AI provider or require an API key.** It also does not change any existing Phase 5 coaching screens.

## Boundary between code and AI

1. The Practice game records each action, mine positions, and an `afterHash` of the **visible board after each move**.
2. `POST /api/coach/verified-brief` receives the finished recording on the **Next.js server**. It validates the input, replays every action, checks each recorded board hash, and confirms the claimed outcome.
3. The deterministic `buildEvidenceReport` produces the allowed findings.
4. `makeVerifiedBrief` constructs a new object containing ONLY the dimensions, result, verified counts, report summary, up to five verified moments, and explicit AI rules. **No mine layout, raw move list, or checkpoint hashes leave this boundary.**
5. A future AI backend can receive this brief and respond with just `{"focusId":"move-4","style":"step-by-step"}`. Validate the reply with `validateBackendFocusReply`; reject unknown IDs, unapproved styles, or additional text. The browser should continue displaying the original verified report, not AI-authored factual claims.

## Request

`POST http://localhost:3000/api/coach/verified-brief`

Content-Type: `application/json`

The body is one **completed**, checkpoint-stamped `PracticeSession`: `game`, `difficulty`, `rows`, `columns`, `mineCount`, `outcome`, `durationSeconds`, `mines`, and ordered `moves`. Every move must include `row`, `col`, `action`, `atMs`, and `afterHash`. The endpoint will reject older unstamped recordings rather than claim they were independently checked.

## Response

HTTP 200: `VerifiedBrief` with:

- `schemaVersion: "1"` and `kind: "verified-practice-coaching-brief"`
- `game` — mode, difficulty, dimensions, mine count, outcome, and duration
- `analysis` — recorded actions, verified mistakes/good moves, uncertain actions, and original rule-written takeaway
- `moments` — up to five actual verified moments with IDs, categories, move numbers, locations, evidence, and advice
- `allowedFocusIds` and `allowedStyles` — permissible choices for AI focus selection
- `aiRules` — restrictions the model must follow

HTTP 400: bad/missing input, including timestamps and unstamped moves.

HTTP 413: recording over 200 KB.

HTTP 422: valid-looking recording failed replay, a checkpoint, or outcome verification.

No authenticated history is created and no database update is performed.

## Local smoke test without an API key

1. Start the Next.js app with `npm run dev`.
2. Complete a **new** Beginner Practice game (older games may lack `afterHash`).
3. Open the browser's DevTools Console on the same site and run:

```js
const saved = sessionStorage.getItem("mindsweeper.practice.lastCompletedGame.v1");
const response = await fetch("/api/coach/verified-brief", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: saved,
});
console.log(response.status, await response.json());
```

Expect HTTP **200**, the `kind: "verified-practice-coaching-brief"` field, and **no** `mines` array or `moves` array in the response. If `saved` is null, finish a new game in this browser tab.

## Security / scope notes

- A client-recorded Practice game is not trusted for competitive results. The checksums are for replay consistency, **not** cryptographic authenticity; a malicious client could forge a self-consistent recording. Never use this endpoint for Ranked scores or rankings.
- The incoming body **does** contain the full mine layout so the server can reconstruct game history; the _outgoing brief_ deliberately excludes it. Never directly forward the raw request body to a model.
- There is no automatic network call to your teammate's FastAPI server. Ask for its URL, authentication method, expected request/response, and deployment plan before enabling server-to-server calls.
- For a public deployment, add rate limits and resource quotas, consider authenticated endpoints, and set an appropriate data-retention policy.
- The format is deliberately small so it can support other LLM providers without touching the Game or Analysis layers.
