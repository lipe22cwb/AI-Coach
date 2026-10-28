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
- Practice Review profile showing up to five finished games from this browser tab (not a permanent lifetime profile)

Authentication requires a configured Supabase project.

### Practice History and Verified Replays

- Temporarily saves up to five completed Practice games in the current browser tab (sessionStorage)
- Interactive move-by-move replay with visible-board checkpoints and evidence-based deductions
- Verified coaching explanations and follow-up questions are distinct from experimental AI-generated wording
- The last game is also saved separately in localStorage for the original Coaching report
- Browser-held recordings are not tamper-proof server verification and are not Ranked results

### AI Coaching

- Dedicated Coaching page with recorded sample games
- "Analyze my last game" action backed by browser storage
- Automatic post-game analysis under the board after every real game
- Game analysis using a rule-based engine
- Optional AI-generated explanations through an external provider
- Reports highlighting gameplay decisions and improvements
- Coaching API at `/api/coach`

The Coaching page keeps two recorded sample sessions so the analyser can be tried
without playing. Finished games from the Play page are sent to the same API
automatically and their report appears under the board. The API accepts real
games on any board up to 16 × 30 (Expert).

### Settings

- Coaching style preferences
- Explanation detail and experience settings
- Personal improvement goals
- Local browser storage for preferences

Coaching preferences are sent to `/api/coach` and shape the wording of a report.
Account-backed persistence still depends on the configured Supabase project.

### Ranked System

- Authenticated 16 × 16 Ranked gameplay with 40 mines, controlled by server-side Supabase functions
- Server-verified winning-result recording and read-only fastest-times API
- Direct client-submitted Ranked results and the older local JSON writer are disabled
- Competitive rating points and rank tiers are not implemented yet. The verified leaderboard still needs end-to-end validation.

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

Major remaining tasks include:

- Durable, account-backed gameplay history (currently a limited browser-tab history)
- Persistent database storage
- Real player statistics and game history
- Ranked ratings, placements, rank tiers, and an end-to-end verified leaderboard UI
- Leaderboards and player progression
- End-to-end browser tests, database deployment verification, and production monitoring

## Testing

Run the project checks:

```bash
npm run check
```

This checks formatting, the production build, and TypeScript. It does not replace manual gameplay and integration testing.

## Team Collaboration

Team members develop features in separate Git branches before merging into master. Shared features should be tested together before changes are considered complete.
