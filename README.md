# AI-Coach

AI-Coach is an AI-powered Minesweeper coaching platform designed to help players improve their skills through gameplay analysis, personalized feedback, and competitive play.

Built with Next.js, React, TypeScript, Tailwind CSS, and Supabase.

## Getting Started

Use Node.js 22 or newer.

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Current Features

### Minesweeper Gameplay

- Beginner, Intermediate, and Expert difficulties
- First-click protection
- Revealing and flagging cells
- Chording functionality
- Game timer and mine counter
- New Game button
- Win and loss detection

### User Accounts

- Sign-in and account creation pages
- Supabase email/password authentication
- Sign-out functionality
- Temporary Practice Review page showing up to five completed games from the current browser tab

Authentication requires a configured Supabase project.

### AI Coaching

- Dedicated Coaching page
- Game analysis using a rule-based engine
- Optional AI selection of an existing, rule-verified coaching focus
- Evidence-based post-game report, move replay, and one follow-up question
- Coaching API at `/api/coach`

Completed Practice games can be reviewed from the game-over screen or the temporary Practice Review history. An older experimental sample-report engine remains available separately for comparison.

### Settings

- Coaching style preferences
- Explanation detail and experience settings
- Personal improvement goals
- Local browser storage for preferences

Guest settings use browser storage; signed-in settings can use the Supabase account adapter when the database is configured. Coaching personalization is not part of the verified MVP.

### Ranked System

- Experimental authenticated Ranked matches backed by Supabase RPCs
- Server-verified reveal, flag, chord, and match restoration routes
- Unverified Ranked result submissions intentionally disabled

Ranked depends on its separate database functions and environment; competitive ratings, leaderboards, and full production readiness are outside the revised Practice-coaching MVP.

## Project Structure

- `app/` - Website pages and API routes
- `components/play/` - Minesweeper and navigation components
- `components/account/` - Authentication components
- `components/coach/` - Coaching interface
- `components/settings/` - Settings interface
- `lib/coach/` - Coaching analysis engine
- `lib/supabase/` - Supabase connection helpers
- `lib/settings/` - Settings preferences and storage
- `docs/` - Project documentation
- `styles/` - Website styling

## Environment Variables

Create a `.env.local` file to configure Supabase authentication and optional AI providers.

Required for Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional AI provider configuration is documented in `.env.example`.

Never commit API keys or secret credentials.

## Development Status

The project is still under active development.

The revised coaching MVP supports Play → Record → Analyze → Coach → Improve for individual Practice games. Remaining priorities include independent real-player usability testing, team integration, deployment checks, and a future optional AI backend. Permanent coaching profiles, Ranked rating progression and leaderboards are deferred.

## Testing

Run both the gameplay regression tests and project checks:

```bash
npm test
npm run check
```

GitHub Actions runs both after the Phase 8.1 update. Manual Practice, Expert replay, and integration checks are still necessary.

## Team Collaboration

Team members develop features in separate Git branches before merging into master. Shared features should be tested together before changes are considered complete.
