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
making a team change.

## Add this source to the team repository

For a repository dedicated to this app, put the **contents** of the extracted
`ai-coach` folder at the repository root. `package.json`, `app`, `components`,
`styles` and `.github` should sit beside each other. Include the dotfiles in
the ZIP; they carry the ignore rules, formatting settings and GitHub workflow.

If the repository already exists, clone it and create a branch first:

```bash
git clone YOUR_TEAM_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
git switch -c setup/ai-coach-prototype
```

Copy the source into that checkout, then run:

```bash
npm ci
npm run check
git status
git add .
git commit -m "Add readable AI-Coach prototype and team setup"
git push -u origin setup/ai-coach-prototype
```

Replace the two placeholders with your team's repository URL and folder name,
then open a pull request. Review `git status` before committing so only intended
project changes are included.

The workflow assumes this app is at the repository root. If your repository
contains multiple projects, place the app in the agreed subfolder and adapt the
workflow's working directory and npm cache path before using it.

## Hosting and assets

The project currently uses `output: "export"` in `next.config.ts`, producing
static files in `out/`. This suits the current prototype. When server routes or
server-side authentication are added, revisit that setting before deployment.
The local development command remains `npm run dev`.

Icons come from Lucide. The font licences are included beside the font files in
`public/fonts`. The navbar and coaching logo share `mine-logo.tsx`; the browser
tab uses `public/favicon.svg`.
