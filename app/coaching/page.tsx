import { Bot, Sparkles } from "lucide-react";

import { CoachConsole } from "@/components/coach/coach-console";
import { Navbar } from "@/components/play/navbar";

export const metadata = {
  title: "AI-Coach | Coaching",
  description: "Send a finished Minesweeper game and get specific coaching feedback.",
};

// The Coaching tab. `CoachConsole` does the interactive work; this page only
// arranges the heading and the shared navigation.
export default function CoachingPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to coaching
      </a>
      <Navbar active="Coaching" />

      <main className="page-shell" id="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ANALYSE. LEARN. IMPROVE.</p>
            <h1>
              Coaching<span className="title-period">.</span>
            </h1>
            <p className="page-subtitle">Send a finished game, get specific feedback</p>
          </div>

          <div className="session-info" aria-label="Coaching API summary">
            <span className="difficulty-label">Gameplay API</span>
            <div>
              <span>
                <Bot size={14} aria-hidden="true" />
                POST /api/coach
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
          <p>The rule engine always runs; an AI provider only rewrites the wording.</p>
          <span>POST /api/coach</span>
        </footer>
      </main>
    </>
  );
}
