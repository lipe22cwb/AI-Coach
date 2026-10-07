import { ArrowUpRight, Flag, MessageSquare, X } from "lucide-react";

import { MineLogo } from "./mine-logo";

// This is sample feedback, not analysis of the displayed board.
// The `open` attribute shows the report on first load. Clicking the summary
// closes it; CSS swaps the X for the message icon so it can be reopened.
export function CoachPreview() {
  return (
    <details className="coach-panel" open>
      <summary className="coach-toggle">
        <MineLogo className="coach-mine" />
        <span className="coach-name">AI Coach</span>
        <span className="sample-label">Sample report</span>
        <span className="coach-toggle-icon" aria-hidden="true">
          <X className="close-icon" size={18} />
          <MessageSquare className="reopen-icon" size={18} />
        </span>
        <span className="sr-only"> — show or hide post-game feedback</span>
      </summary>

      <div className="coach-content">
        <div className="report-heading">
          <span className="report-marker" aria-hidden="true" />
          <h2>POST-GAME FEEDBACK</h2>
        </div>

        <h3>
          A good read.
          <br />
          One thing to work on.
        </h3>
        <p className="coach-intro">
          You recognised the 1–2–1 pattern and flagged both outer squares.
        </p>

        {/* This small diagram explains the pattern used in the sample feedback. */}
        <div
          className="pattern-example"
          role="img"
          aria-label="Pattern example: a row of 1, 2, 1 above a row containing a mine, a safe square, and a mine."
        >
          <div className="pattern-grid" aria-hidden="true">
            <span>1</span>
            <span className="pattern-two">2</span>
            <span>1</span>
            <span className="pattern-mine">
              <Flag size={16} fill="currentColor" />
            </span>
            <span className="pattern-safe">✓</span>
            <span className="pattern-mine">
              <Flag size={16} fill="currentColor" />
            </span>
          </div>
          <div className="pattern-caption">
            <strong>1–2–1 pattern</strong>
            <span>Two mines. One safe square.</span>
          </div>
        </div>

        <p className="pattern-condition">
          This example assumes the three numbers touch only these three covered squares,
          with no other adjacent mines.
        </p>

        <div className="next-step">
          <span className="subtle-label">Next game</span>
          <p>Before guessing, check the other edges for a safe move.</p>
        </div>

        <div className="coach-footer">
          <span>After the game, ask about a move.</span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </div>
      </div>
    </details>
  );
}
