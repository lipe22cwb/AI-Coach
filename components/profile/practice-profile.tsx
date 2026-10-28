"use client";

import Link from "next/link";
import { CalendarDays, Clock3, Gamepad2, History, Play, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  loadRecentPracticeSessions,
  RECENT_SESSION_LIMIT,
  type SavedPracticeSession,
} from "@/lib/practice/history";

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The revised MVP intentionally does not pretend to have permanent player
// rankings, lifetime statistics, improvement trends or verified mistake rates.
export function PracticeProfile() {
  const [games, setGames] = useState<SavedPracticeSession[] | null>(null);

  useEffect(() => {
    setGames(loadRecentPracticeSessions());
  }, []);

  const summary = useMemo(() => {
    const current = games ?? [];
    return {
      wins: current.filter((game) => game.outcome === "win").length,
      losses: current.filter((game) => game.outcome === "loss").length,
      total: current.length,
    };
  }, [games]);

  return (
    <main className="page-shell profile-page">
      <div className="profile-heading">
        <div>
          <p className="eyebrow">SINGLE-SESSION REVIEW</p>
          <h1>
            Practice Review<span className="title-period">.</span>
          </h1>
          <p className="page-subtitle">
            Review up to five recently completed Practice games, including Expert.
          </p>
        </div>
        <div className="profile-actions">
          <span className="preview-badge">This browser tab only</span>
          <Link className="profile-play-link" href="/">
            <Gamepad2 size={17} aria-hidden="true" /> Back to Play
          </Link>
        </div>
      </div>

      <section className="profile-summary" aria-label="Current session Practice results">
        <div className="profile-stat">
          <History size={19} aria-hidden="true" />
          <span>Completed this session</span>
          <strong>{games ? summary.total : "—"}</strong>
        </div>
        <div className="profile-stat">
          <Target size={19} aria-hidden="true" />
          <span>Wins this session</span>
          <strong>{games ? summary.wins : "—"}</strong>
        </div>
        <div className="profile-stat">
          <Clock3 size={19} aria-hidden="true" />
          <span>Losses this session</span>
          <strong>{games ? summary.losses : "—"}</strong>
        </div>
      </section>

      <section className="profile-panel practice-session-card">
        <div className="panel-heading-row">
          <div>
            <span className="profile-label">RECORDED PRACTICE GAMES</span>
            <h2>Recent Games</h2>
          </div>
          <CalendarDays size={24} aria-hidden="true" />
        </div>

        {games && games.length > 0 ? (
          <div className="recent-games">
            {games.map((game) => (
              <div className="recent-game practice-recent-game" key={game.id}>
                <span className={`result-dot ${game.outcome}`} aria-hidden="true" />
                <div className="recent-result">
                  <strong>{game.outcome === "win" ? "Win" : "Loss"}</strong>
                  <span>
                    {game.difficulty} · {game.rows} × {game.columns} ·{" "}
                    {formatDate(game.completedAt)}
                  </span>
                </div>
                <span className="recent-detail">
                  <Clock3 size={14} aria-hidden="true" />{" "}
                  {formatTime(game.durationSeconds)}
                </span>
                <span className="recent-detail">{game.moves.length} actions</span>
                {/* Verified replay supports both square and rectangular Practice boards. */}
                <a
                  className="practice-review-link"
                  href={"/coaching?source=practice&gameId=" + encodeURIComponent(game.id)}
                >
                  <Play size={14} aria-hidden="true" /> Review game
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="practice-empty-history">
            <p>Finish a Practice game and it will appear here.</p>
            <Link className="profile-play-link" href="/">
              <Gamepad2 size={16} aria-hidden="true" /> Start a Practice Game
            </Link>
          </div>
        )}
      </section>

      <p className="profile-disclaimer">
        Only the latest {RECENT_SESSION_LIMIT} completed games from this browser tab are
        kept for testing. Records are temporary and are not synced with an account or used
        for Ranked. This is not a permanent player profile, a lifetime win rate, or an
        improvement claim. Coaching decisions must be verified from the recorded board and
        actions before being presented as facts.
      </p>
    </main>
  );
}
