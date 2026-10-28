import Link from "next/link";
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
        <h3>
          Play first.
          <br />
          Learn from your moves.
        </h3>
        <p className="coach-intro">
          Finish a Practice game and select <strong>Review This Game</strong>. You'll get
          verified moves, an interactive replay, and a short takeaway. AI is optional.
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
            <span className="pattern-mine">
              <Flag size={16} fill="currentColor" />
            </span>
            <span className="pattern-safe">✓</span>
            <span className="pattern-mine">
              <Flag size={16} fill="currentColor" />
            </span>
          </div>
          <div className="pattern-caption">
            <strong>Example: 1–2–1</strong>
            <span>General lesson, not live game feedback</span>
          </div>
        </div>
        <p className="pattern-condition">
          This deduction applies only when the three numbers are constrained by exactly
          these three covered squares, with no other touching hidden mines.
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
