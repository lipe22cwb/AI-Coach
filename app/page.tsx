"use client";

import { Flag, Grid2X2 } from "lucide-react";
import { useState } from "react";

import { CoachPreview } from "@/components/play/coach-preview";
import { CurrentFocus } from "@/components/play/current-focus";
import { MinesweeperBoard } from "@/components/play/minesweeper-board";
import { ModeSelector } from "@/components/play/mode-selector";
import { Navbar } from "@/components/play/navbar";
import { DEFAULT_DIFFICULTY, DIFFICULTY_SETTINGS } from "@/lib/game-settings";
import type { Difficulty } from "@/lib/game-settings";

export default function Home() {
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const settings = DIFFICULTY_SETTINGS[difficulty];

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to game</a>
      <Navbar />

      <main className="page-shell" id="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PLAY. LEARN. IMPROVE.</p>
            <h1>Minesweeper<span className="title-period">.</span></h1>
            <p className="page-subtitle">Learn how to really play</p>
          </div>

          <div className="session-info" aria-label={`${settings.label} board: ${settings.rows} by ${settings.columns}, ${settings.mines} mines`}>
            <span className="difficulty-label">{settings.label}</span>
            <div>
              <span><Grid2X2 size={14} aria-hidden="true" /> {settings.rows} × {settings.columns}</span>
              <span><Flag size={14} aria-hidden="true" /> {settings.mines} mines</span>
            </div>
          </div>
        </div>

        <div className="difficulty-row" role="group" aria-label="Choose board difficulty">
          <label htmlFor="difficulty-select">Difficulty</label>
          <select id="difficulty-select" className="difficulty-select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
            <option value="beginner">Beginner — 9 × 9, 10 mines</option>
            <option value="intermediate">Intermediate — 16 × 16, 40 mines</option>
            <option value="expert">Expert — 16 × 30, 99 mines</option>
          </select>
        </div>

        {/* Keep this existing component for the separate, future game-mode feature. */}
        <div className="mode-row">
          <ModeSelector />
          <span className="preview-note">Playable game</span>
        </div>

        <div className="play-layout">
          <MinesweeperBoard key={difficulty} settings={settings} />
          <aside className="coach-sidebar" aria-label="Coaching tools">
            <CurrentFocus />
            <CoachPreview />
          </aside>
        </div>

        <footer className="page-footer">
          <p>Practice with feedback. Play ranked without live coaching.</p>
          <span>{settings.rows} × {settings.columns} · {settings.mines} mines</span>
        </footer>
      </main>
    </>
  );
}
