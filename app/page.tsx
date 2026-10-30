"use client";

import { Flag, Grid2X2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { GameCoachReport } from "@/components/coach/game-coach-report";
import { CoachPreview } from "@/components/play/coach-preview";
import { CurrentFocus } from "@/components/play/current-focus";
import { MinesweeperBoard } from "@/components/play/minesweeper-board";
import { ModeSelector } from "@/components/play/mode-selector";
import { Navbar } from "@/components/play/navbar";
import { saveLastGame } from "@/lib/coach/last-game";
import type { GameplaySession } from "@/lib/coach/types";
import { DEFAULT_DIFFICULTY, DIFFICULTY_SETTINGS } from "@/lib/game-settings";
import type { Difficulty } from "@/lib/game-settings";
import { createPracticeRepository } from "@/lib/practice/repository";
import type { PracticeSession } from "@/lib/practice/history";

export default function Home() {
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [lastGame, setLastGame] = useState<GameplaySession | null>(null);
  const [practiceSaveState, setPracticeSaveState] = useState<
    "idle" | "saving" | "account" | "local" | "error"
  >("idle");
  const practiceRepository = useMemo(() => createPracticeRepository(), []);
  const settings = DIFFICULTY_SETTINGS[difficulty];

  // Keep the report responsive while saving the same complete recording through
  // the repository; local storage is written before any Supabase request.
  const handleGameComplete = useCallback(
    (session: PracticeSession) => {
      setLastGame(session);
      saveLastGame(session);
      setPracticeSaveState("saving");
      void practiceRepository
        .save(session)
        .then(async () => {
          setPracticeSaveState(await practiceRepository.getStorageMode());
        })
        .catch(() => setPracticeSaveState("error"));
    },
    [practiceRepository],
  );

  const retryPracticeSync = useCallback(() => {
    setPracticeSaveState("saving");
    void practiceRepository
      .syncPending()
      .then(async () => setPracticeSaveState(await practiceRepository.getStorageMode()))
      .catch(() => setPracticeSaveState("error"));
  }, [practiceRepository]);

  const handleGameStart = useCallback(() => setLastGame(null), []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to game
      </a>
      <Navbar />

      <main className="page-shell" id="main-content">
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
            aria-label={`${settings.label} board: ${settings.rows} by ${settings.columns}, ${settings.mines} mines`}
          >
            <span className="difficulty-label">{settings.label}</span>
            <div>
              <span>
                <Grid2X2 size={14} aria-hidden="true" /> {settings.rows} ×{" "}
                {settings.columns}
              </span>
              <span>
                <Flag size={14} aria-hidden="true" /> {settings.mines} mines
              </span>
            </div>
          </div>
        </div>

        <div className="difficulty-row" role="group" aria-label="Choose board difficulty">
          <label htmlFor="difficulty-select">Difficulty</label>
          <select
            id="difficulty-select"
            className="difficulty-select"
            value={difficulty}
            onChange={(event) => {
              setDifficulty(event.target.value as Difficulty);
              setLastGame(null);
            }}
          >
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
          <MinesweeperBoard
            key={difficulty}
            settings={settings}
            onGameComplete={handleGameComplete}
            onGameStart={handleGameStart}
          />
          <aside className="coach-sidebar" aria-label="Coaching tools">
            <CurrentFocus />
            <CoachPreview />
          </aside>
        </div>

        {lastGame ? <GameCoachReport session={lastGame} /> : null}
        {lastGame && practiceSaveState !== "idle" ? (
          <p className="practice-save-status" role="status" aria-live="polite">
            {practiceSaveState === "saving" && "Saving Practice history…"}
            {practiceSaveState === "account" && "Practice history saved to your account."}
            {practiceSaveState === "local" &&
              "Practice history saved in this browser tab."}
            {practiceSaveState === "error" && (
              <>
                Practice history is kept in this browser tab, but account sync failed.{" "}
                <button type="button" onClick={retryPracticeSync}>
                  Retry sync
                </button>
              </>
            )}
          </p>
        ) : null}

        <footer className="page-footer">
          <p>Practice with feedback. Play ranked without live coaching.</p>
          <span>
            {settings.rows} × {settings.columns} · {settings.mines} mines
          </span>
        </footer>
      </main>
    </>
  );
}
