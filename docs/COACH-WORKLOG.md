# Coaching tab + gameplay analysis API — work log

**Owner:** Luiz · **Branch:** `Luiz-Branch` · **Feature:** "Coaching tab API included"

This file records everything done on the Coaching work, from the empty prototype
to now. It exists so the work can be resumed later — by Luiz alone, or in a fresh
AI session — without re-discovering how it fits together. The API contract itself
lives in [COACH-API.md](COACH-API.md); this file is the story around it.

---

## 1. Where this fits

- Project: **AI-Coach**, a Minesweeper coaching platform prototype.
- Stack: **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4**.
- Trade-show goal (Oct 28): the website should work **without the AI**.
- Assignment split: Luiz owns the **Coaching tab and its API**. Others own the
  playable board (game mechanics), sign-in/profile and the trade-show setup.
  This work touches **only Luiz's part**.

## 2. Starting point (before this work)

- The app was a **static prototype** (`output: "export"` in `next.config.ts`).
- **No backend, no API, no AI.** The board was a picture; the sidebar "AI Coach"
  panel was fixed sample text (`components/play/coach-preview.tsx`).
- The navigation "Coaching" entry was a disabled preview button.

## 3. What was built, from zero

### 3.1 The rule engine — `lib/coach/analyze.ts` (the important part)

A pure TypeScript engine that replays a recorded game and judges it. It needs no
network and no API key, so the feature works offline and for free.

For each game it:

- rebuilds the board from the mine layout, including blank-square flood fill;
- applies the standard single-point rule (a number with all its flags placed
  proves its other covered neighbours are safe; a number with no flags left
  proves they are mines);
- classifies every click as **certain**, **forced guess** or **avoidable guess**
  (a guess made while a proven-safe square was still available);
- counts flags right/wrong, chording, the opening click (corner/edge/centre);
- scores the game, finds the **key moment**, and writes the headline, summary,
  strengths, improvements and next steps.

### 3.2 The API — `app/api/coach/route.ts`

- `POST /api/coach` accepts one `GameplaySession` and returns a `CoachResult`.
- Validates the input and answers `400` with a clear message on bad data.
- `GET /api/coach` reports whether an AI provider is configured and returns the
  sample game (a health check).

### 3.3 The AI layer — `lib/coach/providers.ts`, `lib/coach/prompt.ts`, `lib/coach/index.ts`

- Provider-agnostic: **OpenAI, Anthropic or Gemini**, chosen by environment
  variables. All three are called with plain `fetch`, so **no new dependency**.
- The provider receives the rule engine's findings and **only rewrites the
  wording**. The score, metrics and key moment always stay deterministic.
- No key, or a provider error → it falls back to the rule report automatically.
  The app never breaks because of the AI.

### 3.4 The Coaching tab — `app/coaching/page.tsx`, `components/coach/`

- A real page (was a disabled nav button).
- `coach-console.tsx` (client): buttons to analyse a sample loss or a sample win,
  a provider-status badge, and a browser-side fallback if the API is unreachable.
- `coach-report-view.tsx`: renders the report — grade/score badge, summary,
  metrics grid, key-moment callout, "what worked" / "what to work on", next steps.

### 3.5 Sample games — `lib/coach/sample-session.ts`

Two hand-generated, valid 9 × 9 / 10-mine games (with the mine layout) used by the
demo buttons: one clean win and one loss with an avoidable mistake.

### 3.6 Supporting changes

- `components/play/navbar.tsx`: `Play` and `Coaching` are now real links; `Profile`
  and `Settings` stay preview buttons. `Navbar` takes an `active` prop.
- `styles/coaching.css` + `styles/responsive.css`: styles for the new tab, keeping
  the project's dark theme and the "desktop first, overrides in responsive.css" rule.
- `next.config.ts`: **removed `output: "export"`** (explained in section 6).
- `.env.example`: template for the optional provider keys.
- `docs/COACH-API.md`: the full API contract.
- `README.md` and `docs/PROJECT-GUIDE.md`: updated to mention the tab, the API and
  the hosting change.

## 4. How it works (data flow)

```
Coaching page (client)
   └─ POST /api/coach  ──►  lib/coach/index.ts  ──►  analyze.ts (rule engine, always runs)
                                   │
                                   ├─ no provider / failure ─► rule report
                                   └─ provider configured ───► AI rewrites the prose,
                                                               deterministic numbers kept
   ◄── CoachResult { report, fallbackReason }
```

## 5. API contract (short version)

Send one game; get one report. Full details in [COACH-API.md](COACH-API.md).

```json
{
  "game": "minesweeper",
  "difficulty": "Beginner",
  "boardSize": 9,
  "mineCount": 10,
  "outcome": "win",
  "durationSeconds": 38,
  "mines": [5, 9, 23, 24, 35, 36, 58, 65, 69, 72],
  "moves": [{ "row": 2, "col": 4, "action": "reveal" }]
}
```

Rows/columns and mine indices are **zero-based**. `mines` is optional but strongly
recommended: without it the coach cannot replay decisions and says so.

## 6. Key decisions and why

| Decision                                         | Why                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Rule engine always runs; AI is optional          | Works with no key, no network, no cost — matters for the trade show and for grading. |
| Provider-agnostic (OpenAI/Anthropic/Gemini)      | No lock-in; the team can use whichever key is already available.                     |
| Metrics/score computed by the engine, not the AI | Keeps feedback honest; the AI can't invent numbers or positions.                     |
| Called with `fetch`, no SDK                      | Zero new dependencies; keeps the install small and the build safe.                   |
| English output                                   | Matches the existing UI.                                                             |
| Removed `output: "export"`                       | API routes need a server. Static files cannot run the analysis or call the AI.       |

## 7. Files added / changed

| File                                     | Added/Changed | Role                                               |
| ---------------------------------------- | ------------- | -------------------------------------------------- |
| `lib/coach/types.ts`                     | added         | Shared data + report types (no framework imports). |
| `lib/coach/analyze.ts`                   | added         | Rule engine (pure, reusable in browser).           |
| `lib/coach/prompt.ts`                    | added         | Builds the AI brief; parses the JSON reply.        |
| `lib/coach/providers.ts`                 | added         | OpenAI / Anthropic / Gemini adapters + selection.  |
| `lib/coach/index.ts`                     | added         | Pipeline: analyse → optional AI → fallback.        |
| `lib/coach/sample-session.ts`            | added         | Two sample games for the demo.                     |
| `app/api/coach/route.ts`                 | added         | HTTP endpoint + validation.                        |
| `app/coaching/page.tsx`                  | added         | The Coaching tab.                                  |
| `components/coach/coach-console.tsx`     | added         | Interactive console (client).                      |
| `components/coach/coach-report-view.tsx` | added         | Report presentation.                               |
| `.env.example`                           | added         | Provider key template.                             |
| `docs/COACH-API.md`                      | added         | Full API contract.                                 |
| `docs/COACH-WORKLOG.md`                  | added         | This file.                                         |
| `components/play/navbar.tsx`             | changed       | Real links for Play/Coaching; `active` prop.       |
| `styles/coaching.css`                    | changed       | Styles for the new tab.                            |
| `styles/responsive.css`                  | changed       | Tablet/phone overrides for the tab.                |
| `next.config.ts`                         | changed       | Removed `output: "export"`.                        |
| `README.md`, `docs/PROJECT-GUIDE.md`     | changed       | Documentation of the above.                        |

## 8. Verification done

- `npm run typecheck` — passes.
- `npm run build` — passes; routes: `/` (static), `/coaching` (static),
  `/api/coach` (dynamic).
- `npm run check` (format + build + typecheck) — passes.
- End-to-end with a local server:
  - `GET /api/coach` → `{ configured: false, provider: null, sample: … }`.
  - `POST` win game → grade **S**, score **100**, 18 certain reveals / 2 forced guesses.
  - `POST` loss game → grade **C**, score **57**, key moment _"move 9 … hit a mine
    while 9 provably safe squares were still on the board."_
  - Bad body → `400 {"error":"Move 1 has a row or column outside the board."}`.
- Checked in the browser: `/coaching` empty state and generated report render
  correctly; the Play page is unchanged.

## 9. Status

**Done (Luiz's part):**

- [x] Coaching tab reachable from the navigation.
- [x] `POST /api/coach` + validation.
- [x] Rule engine with scoring, key moment and advice.
- [x] Optional OpenAI / Anthropic / Gemini integration with automatic fallback.
- [x] Sample games and demo buttons.
- [x] Docs (API + worklog) and `.env.example`.

**Not part of this work (other teammates):**

- [ ] Playable board that records real games (game mechanics — Jinglan).
- [ ] Sign-in / profile (Ian).
- [ ] Ranked page, settings, game-mode switching.

**Integration point:** when the board can record a game, it only needs to POST a
`GameplaySession` to `/api/coach`. Nothing else in this work changes.

## 10. How to run and configure

```bash
npm install
npm run dev                     # open http://localhost:3000/coaching
```

Optional AI wording:

```bash
cp .env.example .env.local      # set ONE provider key
# COACH_PROVIDER=openai|anthropic|gemini   (empty = auto-pick by key)
# OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
# COACH_MODEL=...              (optional model override)
```

## 11. Caveats to remember

- **Hosting changed:** because of the API route, the site needs a host that runs
  Node (Vercel, Render, Railway, or `next start`). Plain static hosting such as
  GitHub Pages no longer works on its own. If static hosting is required, either
  host the API separately or drop the AI and keep only the browser rule engine
  (already possible — `analyze.ts` is pure).
- The demo buttons analyse two **stored** sample games; they do not need the
  playable board. A future option is a "random game" generator button so each
  click shows a different report without a playable board.

## 12. Resume brief (paste into a new chat)

> Repo: `~/Documents/GitHub/AI-Coach`, branch **Luiz-Branch** (never master).
> My part is only the **Coaching tab + gameplay analysis API** ("Luiz - Coaching
> tab API included"). It is already built and working: `app/coaching/page.tsx`
> (tab), `app/api/coach/route.ts` (`POST /api/coach`), `lib/coach/*` (pure rule
> engine + optional OpenAI/Anthropic/Gemini via `fetch`, with fallback to rules).
> Docs: `docs/COACH-API.md` and `docs/COACH-WORKLOG.md`. The rule engine always
> runs; AI only rewrites the prose. The site needs a Node host because I removed
> `output: "export"` for the API. Read `docs/COACH-WORKLOG.md` first. Do not touch
> other teammates' parts (playable board, sign-in, ranked).

## 13. Commit

Latest commit on `Luiz-Branch`: run `git log -1 --stat` to see the message and the
full file list.
