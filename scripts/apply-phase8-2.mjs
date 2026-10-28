// Phase 8.2 — scoped UI and documentation polish for INTP302 AI-Coach.
// Run once from the repository root: node scripts/apply-phase8-2.mjs
// Every required match is checked before ANY file is written.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const projectFile = resolve(root, "package.json");
if (
  !existsSync(projectFile) ||
  JSON.parse(readFileSync(projectFile, "utf8")).name !== "ai-coach"
) {
  throw new Error(
    "Run this script from the AI-Coach repository root (the folder with package.json).",
  );
}
const changes = new Map();
function content(file) {
  if (changes.has(file)) return changes.get(file);
  const full = resolve(root, file);
  if (!existsSync(full)) throw new Error(`Required project file is missing: ${file}`);
  return readFileSync(full, "utf8");
}
function set(file, next) {
  changes.set(file, next);
}
function replaceExactly(file, oldPart, newPart) {
  const original = content(file);
  const first = original.indexOf(oldPart);
  if (first === -1 || original.indexOf(oldPart, first + oldPart.length) !== -1) {
    throw new Error(
      `Cannot safely patch ${file}: expected exactly one matching source section.`,
    );
  }
  set(file, original.slice(0, first) + newPart + original.slice(first + oldPart.length));
}
function replaceBetween(file, begin, end, transform) {
  const original = content(file);
  const start = original.indexOf(begin);
  const finish = start < 0 ? -1 : original.indexOf(end, start);
  if (start < 0 || finish < 0 || original.indexOf(begin, start + begin.length) !== -1) {
    throw new Error(`Cannot safely patch ${file}: code changed since the Phase 8 audit.`);
  }
  const before = original.slice(start, finish);
  const replacement = transform(before);
  set(file, original.slice(0, start) + replacement + original.slice(finish));
}
function overwriteIfOld(file, marker, next) {
  if (!content(file).includes(marker)) {
    throw new Error(
      `Cannot safely replace ${file}: expected previous component was not found.`,
    );
  }
  set(file, next);
}

// 1. Expert (16x30) games have verified replay support. The Profile link
// incorrectly hid it because the older *experimental* API was square-only.
replaceBetween(
  "components/profile/practice-profile.tsx",
  "                {game.rows === game.columns ? (",
  "\n              </div>\n",
  () => `                {/* Verified replay supports both square and rectangular Practice boards. */}
                <a
                  className="practice-review-link"
                  href={"/coaching?source=practice&gameId=" + encodeURIComponent(game.id)}
                >
                  <Play size={14} aria-hidden="true" /> Review game
                </a>`,
);
replaceExactly(
  "components/profile/practice-profile.tsx",
  "A small temporary history to test our game recording and coaching.",
  "Review up to five recently completed Practice games, including Expert.",
);

// 2. Make the sidebar an honest GUIDE, not a fictional personalized report.
overwriteIfOld(
  "components/play/coach-preview.tsx",
  "Sample report",
  `import Link from "next/link";
import { ArrowUpRight, Flag, MessageSquare, X } from "lucide-react";

import { MineLogo } from "./mine-logo";

// This sidebar teaches the workflow; it does NOT claim to analyse the live board.
// Personalized evidence is only available after a completed Practice game.
export function CoachPreview() {
  return (
    <details className="coach-panel" open>
      <summary className="coach-toggle">
        <MineLogo className="coach-mine" />
        <span className="coach-name">Coaching guide</span>
        <span className="sample-label">Example only</span>
        <span className="coach-toggle-icon" aria-hidden="true">
          <X className="close-icon" size={18} />
          <MessageSquare className="reopen-icon" size={18} />
        </span>
        <span className="sr-only"> — show or hide coaching instructions</span>
      </summary>

      <div className="coach-content">
        <div className="report-heading">
          <span className="report-marker" aria-hidden="true" />
          <h2>HOW POST-GAME COACHING WORKS</h2>
        </div>
        <h3>Play first.<br />Learn from your moves.</h3>
        <p className="coach-intro">
          Finish a Practice game and select <strong>Review This Game</strong>.
          You'll get verified moves, an interactive replay, and a short takeaway.
          AI is optional.
        </p>

        <div
          className="pattern-example"
          role="img"
          aria-label="Illustrative Minesweeper pattern: 1, 2, 1 above mine, safe square, mine. Not taken from your current game."
        >
          <div className="pattern-grid" aria-hidden="true">
            <span>1</span>
            <span className="pattern-two">2</span>
            <span>1</span>
            <span className="pattern-mine"><Flag size={16} fill="currentColor" /></span>
            <span className="pattern-safe">✓</span>
            <span className="pattern-mine"><Flag size={16} fill="currentColor" /></span>
          </div>
          <div className="pattern-caption">
            <strong>Example: 1–2–1</strong>
            <span>General lesson, not live game feedback</span>
          </div>
        </div>
        <p className="pattern-condition">
          This deduction applies only when the three numbers are constrained by
          exactly these three covered squares, with no other touching hidden mines.
        </p>
        <div className="next-step">
          <span className="subtle-label">After the game</span>
          <p>Review the recorded evidence before deciding what to practice next.</p>
        </div>
        <div className="coach-footer">
          <Link href="/profile" className="coach-guide-link">
            Review recent games <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </details>
  );
}
`,
);

// 3. The generic pre-game tip must not imply a personalized coaching target.
overwriteIfOld(
  "components/play/current-focus.tsx",
  "Current focus",
  `import { ChevronDown, Crosshair } from "lucide-react";

// A general strategy tip shown before play, never a personalized recommendation.
export function CurrentFocus() {
  return (
    <details className="focus-panel">
      <summary className="focus-toggle" title="General Practice tip">
        <Crosshair size={19} aria-hidden="true" />
        <span>Practice tip</span>
        <ChevronDown className="focus-chevron" size={17} aria-hidden="true" />
        <span className="focus-tooltip" aria-hidden="true">General tip</span>
      </summary>
      <div className="focus-content">
        <span className="subtle-label">General strategy — not personalized feedback</span>
        <h2>Check before you guess.</h2>
        <p>
          Look for guaranteed-safe squares from the revealed numbers before
          choosing an uncertain move.
        </p>
        <div className="focus-example">
          <strong>Check the evidence behind flags.</strong>
          <p>
            A flag is a player's guess or deduction, not proof by itself.
            Confirm what the visible numbers establish before treating
            neighboring squares as safe.
          </p>
        </div>
      </div>
    </details>
  );
}
`,
);

// 4. Describe the actual verified experience instead of exposing legacy API labels.
replaceExactly(
  "app/coaching/page.tsx",
  "Send a finished Minesweeper game and get specific coaching feedback.",
  "Review a completed Practice game with evidence-based coaching and move replay.",
);
replaceExactly(
  "app/coaching/page.tsx",
  "Send a finished game, get specific feedback",
  "Review your Practice decisions with visible-board evidence",
);
replaceExactly(
  "app/coaching/page.tsx",
  '<span className="difficulty-label">Gameplay API</span>',
  '<span className="difficulty-label">Post-game review</span>',
);
replaceExactly(
  "app/coaching/page.tsx",
  "                POST /api/coach",
  "                Verified replay",
);
replaceExactly(
  "app/coaching/page.tsx",
  "The rule engine always runs; an AI provider only rewrites the wording.",
  "Verified conclusions come from board logic. Optional AI can select a verified focus.",
);
// The footer has a second occurrence of the legacy API route.
replaceExactly(
  "app/coaching/page.tsx",
  "<span>POST /api/coach</span>",
  "<span>Practice review · AI optional</span>",
);

// 5. Fix copy that implied synced coaching history and permanent progression.
replaceExactly(
  "components/account/sign-in-form.tsx",
  '<p className="eyebrow">YOUR COACHING PROFILE</p>',
  '<p className="eyebrow">YOUR ACCOUNT</p>',
);
replaceExactly(
  "components/account/sign-in-form.tsx",
  "Sign in to continue your Ranked progress, coaching history, and saved games.",
  "Sign in for authenticated Ranked matches and account settings. Practice reviews remain temporary in this browser tab.",
);
replaceExactly(
  "components/account/sign-in-form.tsx",
  "Create an account to save your games, build a player profile, and unlock Ranked mode later.",
  "Create an account for authenticated Ranked matches. Practice game history is not yet saved to your account.",
);

// 6. Give the completed-game call to action an unambiguous name.
replaceExactly(
  "components/play/minesweeper-board.tsx",
  '<Link href="/coaching?source=practice">AI Coach Feedback</Link>',
  '<Link href="/coaching?source=practice">Review This Game</Link>',
);

// 7. Keep unverified sample scoring available for developer comparisons,
// but do not let sample buttons compete with real game review.
replaceExactly(
  "components/coach/coach-console.tsx",
  "Send a game, get a report.",
  "Review a finished Practice game.",
);
replaceExactly(
  "components/coach/coach-console.tsx",
  `Review real Practice decisions with board evidence and a short teaching report.
          Optionally ask AI to prioritize one verified focus area. The older draft reports
          remain available for comparison.`,
  `Review your recorded moves, inspect the visible-board evidence, and ask one
          follow-up question. AI prioritization is optional; prototype sample reports
          are clearly separated below.`,
);
replaceExactly(
  "components/coach/coach-console.tsx",
  "Review My Verified Moves",
  "Review Verified Game",
);
replaceBetween(
  "components/coach/coach-console.tsx",
  "          {SAMPLES.map(",
  '\n        <ul className="coach-help">',
  (originalSampleSection) => {
    const sampleButtons = originalSampleSection.replace(/\n        <\/div>\n$/, "");
    if (sampleButtons === originalSampleSection) {
      throw new Error("Cannot safely identify the end of experimental sample buttons.");
    }
    return `        </div>

        <details className="coach-demo-tests">
          <summary>Experimental sample reports (not verified)</summary>
          <p>
            These examples use the earlier scoring engine for comparison, not your
            recorded game. Results may be approximate or unsupported.
          </p>
          <div className="coach-actions">
${sampleButtons}
          </div>
        </details>
`;
  },
);

// 8. Preserve the rest of the team's README; update only statements now stale.
const readme = "README.md";
replaceExactly(
  readme,
  "- Player profile page with placeholder statistics",
  "- Temporary Practice Review page showing up to five completed games from the current browser tab",
);
replaceExactly(
  readme,
  "- Optional AI-generated explanations through an external provider",
  "- Optional AI selection of an existing, rule-verified coaching focus",
);
replaceExactly(
  readme,
  "- Reports highlighting gameplay decisions and improvements",
  "- Evidence-based post-game report, move replay, and one follow-up question",
);
replaceExactly(
  readme,
  "The Coaching page currently uses sample sessions rather than completed games from the live board.",
  "Completed Practice games can be reviewed from the game-over screen or the temporary Practice Review history. An older experimental sample-report engine remains available separately for comparison.",
);
replaceExactly(
  readme,
  "Settings are not yet fully connected to user accounts or coaching responses.",
  "Guest settings use browser storage; signed-in settings can use the Supabase account adapter when the database is configured. Coaching personalization is not part of the verified MVP.",
);
replaceExactly(
  readme,
  `- Prototype Ranked results API at \`/api/ranked-results\`
- Recording and retrieving submitted winning results
- Results organized by board configuration

Ranked gameplay, verified results, competitive ratings, and production database storage still need implementation.`,
  `- Experimental authenticated Ranked matches backed by Supabase RPCs
- Server-verified reveal, flag, chord, and match restoration routes
- Unverified Ranked result submissions intentionally disabled

Ranked depends on its separate database functions and environment; competitive ratings, leaderboards, and full production readiness are outside the revised Practice-coaching MVP.`,
);
replaceExactly(
  readme,
  `Major remaining tasks include:

- Recording and saving complete gameplay sessions
- Connecting live gameplay to AI coaching
- Persistent database storage
- Real player statistics and game history
- Fully functional Ranked mode
- Leaderboards and player progression
- Automated testing and deployment`,
  `The revised coaching MVP supports Play → Record → Analyze → Coach → Improve for individual Practice games. Remaining priorities include independent real-player usability testing, team integration, deployment checks, and a future optional AI backend. Permanent coaching profiles, Ranked rating progression and leaderboards are deferred.`,
);
replaceExactly(
  readme,
  `Run the project checks:

\`\`\`bash
npm run check
\`\`\`

This checks formatting, the production build, and TypeScript. It does not replace manual gameplay and integration testing.`,
  `Run both the gameplay regression tests and project checks:

\`\`\`bash
npm test
npm run check
\`\`\`

GitHub Actions runs both after the Phase 8.1 update. Manual Practice, Expert replay, and integration checks are still necessary.`,
);

// 9. Small enhancements using the existing dark UI design tokens.
const style = "styles/coaching.css";
if (content(style).includes(".coach-demo-tests {")) {
  throw new Error(
    "Phase 8.2 demo styles already exist; aborting to avoid duplicate updates.",
  );
}
set(
  style,
  content(style) +
    `
/* Phase 8.2: keep experimental reports distinct from verified review. */
.coach-demo-tests {
  margin: 16px 0 20px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.coach-demo-tests summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
}
.coach-demo-tests p {
  margin: 12px 0;
}
.coach-demo-tests .coach-actions {
  margin: 12px 0 0;
}
.coach-guide-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #f1b5bb;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.coach-guide-link:hover {
  color: white;
}
`,
);

// Never touch a source file until ALL expected anchors have matched.
for (const [file, next] of changes) {
  const full = resolve(root, file);
  writeFileSync(full, next, "utf8");
  console.log(`Updated ${file}`);
}
console.log(
  `Phase 8.2 applied successfully (${changes.size} files). Run npx prettier . --write, npm test, npm run check, and test an Expert game review.`,
);
