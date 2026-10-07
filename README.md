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
with the source files; a missing font will stop the build. No environment
variables or API keys are needed for this version.

## What is implemented

- Responsive Play screen with AI-Coach branding and the red mine logo.
- Static Minesweeper board, sample stats and sample coaching feedback.
- Current focus starts collapsed; AI Coach starts open. Both can be opened and
  closed with the mouse or keyboard.
- Keyboard focus styles, a skip link and reduced-motion support.

The board is not playable yet. New Game, Ranked, Sign In and the other navigation
items are placeholders. The timer is fixed, and the coaching report is sample
content rather than analysis of the displayed board. There is no backend,
account system, ranking system or AI connection in this version.

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
| Tablet and phone layouts                        | `styles/responsive.css`                                  |

Read [the project guide](docs/PROJECT-GUIDE.md) for how the files connect and where
to begin when adding real gameplay. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
making a change.
