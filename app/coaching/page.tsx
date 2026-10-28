import { Bot, Sparkles } from "lucide-react";

import { CoachConsole } from "@/components/coach/coach-console";
import { Navbar } from "@/components/play/navbar";

export const metadata = {
  title: "AI-Coach | Coaching",
  description:
    "Review a completed Practice game with evidence-based coaching and move replay.",
};

// The Coaching tab. `CoachConsole` does the interactive work; this page only
// arranges the heading and the shared navigation.
export default function CoachingPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to coaching
      </a>
      <Navbar />

      <main className="page-shell" id="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ANALYSE. LEARN. IMPROVE.</p>
            <h1>
              Coaching<span className="title-period">.</span>
            </h1>
            <p className="page-subtitle">
              Review your Practice decisions with visible-board evidence
            </p>
          </div>

          <div className="session-info" aria-label="Coaching API summary">
            <span className="difficulty-label">Post-game review</span>
            <div>
              <span>
                <Bot size={14} aria-hidden="true" />
                Verified replay
              </span>
              <span>
                <Sparkles size={14} aria-hidden="true" />
                AI optional
              </span>
            </div>
          </div>
        </div>

        <CoachConsole />

        <footer className="page-footer">
          <p>
            Verified conclusions come from board logic. Optional AI can select a verified
            focus.
          </p>
          <span>Practice review · AI optional</span>
        </footer>
      </main>
    </>
  );
}
