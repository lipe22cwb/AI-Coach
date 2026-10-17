# AI-Coach

The first visual prototype of our Minesweeper coaching platform. The Play screen
opens straight onto a 16 × 16 board, with Practice selected and coaching tools
alongside it.

Built with Next.js App Router, React, TypeScript and Tailwind CSS 4.

## Run the project

Use Node.js 24 if possible. Node.js 22 or newer is required; `.nvmrc` records the
version used by the GitHub checks. Open the folder containing `package.json`,
then run:

```bash
npm ci
npm run dev
```

`npm ci` installs the exact dependency versions in `package-lock.json`. Use
`npm install package-name` when intentionally adding a dependency, and commit
both package files after doing so.

Roboto and Roboto Condensed are included in `public/fonts`. Keep that folder
with the source files; a missing font will stop the build. The app runs with no
environment variables at all: the built-in rule coach answers on its own. Add an
AI provider key from [`.env.example`](.env.example) only when you want the same
feedback rewritten in friendlier words.

The Coaching tab added a server route (`/api/coach`), so the project is no longer
built as static files. Run it with `npm run dev`, or a Node host in production.

## What is implemented

- Responsive Play screen with AI-Coach branding and the red mine logo.
- Static Minesweeper board, sample stats and a sample coach panel in the sidebar.
- A real **Coaching** tab: pick a recorded game and get a generated report with a
  score, the key moment, strengths, improvements and next steps.
- `POST /api/coach` replays the game with a built-in rule engine and, when an AI
  provider key is configured, rewrites the same findings in friendlier words.
- Current focus starts collapsed; AI Coach starts open. Both can be opened and
  closed with the mouse or keyboard.
- Keyboard focus styles, a skip link and reduced-motion support.

The Play board is not playable yet. New Game, Ranked, Sign In and the remaining
navigation items are placeholders, and the timer is fixed. The sidebar AI Coach
is still sample content. There is no account system or ranking system yet.

## Where to make changes

| Change                                          | Start here                                               |
| ----------------------------------------------- | -------------------------------------------------------- |
| Heading, subtitle, footer or screen arrangement | `app/page.tsx`                                           |
| Browser title, description or fonts             | `app/layout.tsx`                                         |
| Colours and font choices                        | `styles/theme.css`                                       |
| Page width, sidebar width or main spacing       | `styles/layout.css`                                      |
| Navigation and brand placement                  | `components/play/navbar.tsx`, `styles/navigation.css`    |
| Board appearance and stats styling              | `styles/game.css`                                        |
| Displayed board squares and sample time         | `components/play/board-fixture.ts`                       |
| Board size, mine count and difficulty label     | `lib/game-settings.ts`                                   |
| Sample coaching text                            | `components/play/coach-preview.tsx`, `current-focus.tsx` |
| Coaching panel appearance                       | `styles/coaching.css`                                    |
| Coaching page, console or report UI             | `app/coaching/page.tsx`, `components/coach/`             |
| How a game is analysed (the rule engine)        | `lib/coach/analyze.ts`                                   |
| AI provider keys and models                     | `.env.example`, `lib/coach/providers.ts`                 |
| Tablet and phone layouts                        | `styles/responsive.css`                                  |

## Coaching API

The Coaching tab is documented in [docs/COACH-API.md](docs/COACH-API.md). In short:
copy `.env.example` to `.env.local` to add one AI provider key, or leave it empty
and the built-in rule coach answers with no network and no cost. The API accepts
one recorded game at `POST /api/coach` and returns a report.

Read [the project guide](docs/PROJECT-GUIDE.md) for how the files connect and where
to begin when adding real gameplay. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
making a change.
