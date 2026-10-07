import { Flag, Grid2X2 } from "lucide-react";

import { CoachPreview } from "@/components/play/coach-preview";
import { CurrentFocus } from "@/components/play/current-focus";
import { MinesweeperBoard } from "@/components/play/minesweeper-board";
import { ModeSelector } from "@/components/play/mode-selector";
import { Navbar } from "@/components/play/navbar";
import { BOARD_SIZE, DIFFICULTY_LABEL, TOTAL_MINES } from "@/lib/game-settings";

// This file arranges the Play screen. Each larger section has its own component
// so changes to the board or coach don't turn the homepage into one huge file.
export default function Home() {
  return (
    <>
      {/* Keyboard users can jump past the navigation to the main content. */}
      <a className="skip-link" href="#main-content">
        Skip to game
      </a>
      <Navbar />

      <main className="page-shell" id="main-content">
        {/* Heading and board information */}
        <div className="page-heading">
          <div>
            <p className="eyebrow">PLAY. LEARN. IMPROVE.</p>
            <h1>
              Minesweeper<span className="title-period">.</span>
            </h1>
            <p className="page-subtitle">Learn how to really play</p>
          </div>

          <div
            className="session-info"
            aria-label={`${DIFFICULTY_LABEL} board: ${BOARD_SIZE} by ${BOARD_SIZE}, ${TOTAL_MINES} mines`}
          >
            <span className="difficulty-label">{DIFFICULTY_LABEL}</span>
            <div>
              <span>
                <Grid2X2 size={14} aria-hidden="true" />
                {BOARD_SIZE} × {BOARD_SIZE}
              </span>
              <span>
                <Flag size={14} aria-hidden="true" />
                {TOTAL_MINES} mines
              </span>
            </div>
          </div>
        </div>

        {/* Mode controls */}
        <div className="mode-row">
          <ModeSelector />
          <span className="preview-note">Visual preview</span>
        </div>

        {/* Desktop: board beside the coach. Smaller screens: coach below it. */}
        <div className="play-layout">
          <MinesweeperBoard />

          <aside className="coach-sidebar" aria-label="Coaching tools">
            <CurrentFocus />
            <CoachPreview />
          </aside>
        </div>

        <footer className="page-footer">
          <p>Practice with feedback. Play ranked without live coaching.</p>
          <span>
            {BOARD_SIZE} × {BOARD_SIZE} · {TOTAL_MINES} mines
          </span>
        </footer>
      </main>
    </>
  );
}
