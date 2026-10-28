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
- Player profile page with placeholder statistics

Authentication requires a configured Supabase project.

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

- Prototype Ranked results API at `/api/ranked-results`
- Recording and retrieving submitted winning results
- Results organized by board configuration

Ranked gameplay, verified results, competitive ratings, and production database storage still need implementation.

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

- Recording and saving complete gameplay sessions
- Persistent database storage
- Real player statistics and game history
- Fully functional Ranked mode
- Leaderboards and player progression
- Automated testing and deployment

## Testing

Run the project checks:

```bash
npm run check
```

This checks formatting, the production build, and TypeScript. It does not replace manual gameplay and integration testing.

## Team Collaboration

Team members develop features in separate Git branches before merging into master. Shared features should be tested together before changes are considered complete.
