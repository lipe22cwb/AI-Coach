import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Clock3,
  Crosshair,
  Flag,
  Gamepad2,
  Medal,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { Navbar } from "@/components/play/navbar";

export const metadata: Metadata = {
  title: "Profile | AI-Coach",
  description: "Preview your AI-Coach player profile and progress.",
};

const recentGames = [
  { result: "Win", time: "07:42", moves: 94, mistakes: 2 },
  { result: "Loss", time: "04:18", moves: 61, mistakes: 4 },
  { result: "Win", time: "08:05", moves: 101, mistakes: 1 },
  { result: "Win", time: "06:51", moves: 88, mistakes: 2 },
];

const mistakeBreakdown = [
  { label: "Pattern Recognition", value: 38 },
  { label: "Unnecessary Guessing", value: 27 },
  { label: "Flagging Accuracy", value: 18 },
  { label: "Decision Speed", value: 17 },
];

export default function ProfilePage() {
  return (
    <>
      <Navbar />
      <main className="page-shell profile-page">
        <div className="profile-heading">
          <div>
            <p className="eyebrow">PLAYER PROFILE</p>
            <h1>
              PlayerOne<span className="title-period">.</span>
            </h1>
            <p className="page-subtitle">
              A preview of the long-term progression and coaching dashboard.
            </p>
          </div>

          <div className="profile-actions">
            <span className="preview-badge">Preview data</span>
            <Link className="profile-play-link" href="/">
              <Gamepad2 size={17} aria-hidden="true" />
              Back to Play
            </Link>
          </div>
        </div>

        <section className="profile-summary" aria-label="Player summary">
          <div className="rank-card">
            <div className="rank-icon" aria-hidden="true">
              <Medal size={30} />
            </div>
            <div>
              <span className="profile-label">CURRENT RANK</span>
              <strong>Gold 2</strong>
              <small>64% Ranked win rate</small>
            </div>
          </div>

          <div className="profile-stat">
            <Trophy size={19} aria-hidden="true" />
            <span>Recent Ranked</span>
            <strong>32 / 50</strong>
          </div>
          <div className="profile-stat">
            <TrendingUp size={19} aria-hidden="true" />
            <span>All-Time Win Rate</span>
            <strong>59%</strong>
          </div>
          <div className="profile-stat">
            <Flag size={19} aria-hidden="true" />
            <span>Total Games</span>
            <strong>84</strong>
          </div>
          <div className="profile-stat">
            <Clock3 size={19} aria-hidden="true" />
            <span>Avg. Time</span>
            <strong>07:18</strong>
          </div>
        </section>

        <div className="profile-grid">
          <section className="profile-panel current-focus-card">
            <div className="panel-heading-row">
              <div>
                <span className="profile-label">CURRENT FOCUS</span>
                <h2>Pattern Recognition</h2>
              </div>
              <Target size={24} aria-hidden="true" />
            </div>
            <p>
              You are making fewer unnecessary guesses, but missed board patterns are now
              showing up as the biggest repeatable source of mistakes in recent games.
            </p>
            <div className="focus-progress">
              <div>
                <span>Recent mistake share</span>
                <strong>38%</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: "38%" }} />
              </div>
            </div>
            <button
              className="panel-action"
              type="button"
              title="Coaching page will be added later"
            >
              Ask Coach About This
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>

          <section className="profile-panel improvement-card">
            <div className="panel-heading-row">
              <div>
                <span className="profile-label">RECENT IMPROVEMENT</span>
                <h2>Guessing is down</h2>
              </div>
              <CircleCheck size={24} aria-hidden="true" />
            </div>
            <div className="improvement-number">-31%</div>
            <p>
              Unnecessary guesses are appearing less often across your latest games
              compared with your earlier history.
            </p>
            <span className="comparison-note">
              Last 10 games compared with previous 10
            </span>
          </section>

          <section className="profile-panel breakdown-card">
            <div className="panel-heading-row">
              <div>
                <span className="profile-label">LAST 25 GAMES</span>
                <h2>Mistake Breakdown</h2>
              </div>
              <BrainCircuit size={24} aria-hidden="true" />
            </div>

            <div className="breakdown-list">
              {mistakeBreakdown.map((item) => (
                <div className="breakdown-item" key={item.label}>
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}%</strong>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <span style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="profile-panel history-card">
            <div className="panel-heading-row">
              <div>
                <span className="profile-label">GAME HISTORY</span>
                <h2>Recent Games</h2>
              </div>
              <CalendarDays size={24} aria-hidden="true" />
            </div>

            <div className="recent-games">
              {recentGames.map((game, index) => (
                <div className="recent-game" key={`${game.result}-${index}`}>
                  <span
                    className={`result-dot ${game.result.toLowerCase()}`}
                    aria-hidden="true"
                  />
                  <div className="recent-result">
                    <strong>{game.result}</strong>
                    <span>Ranked · 16 × 16</span>
                  </div>
                  <div className="recent-detail">
                    <Clock3 size={14} aria-hidden="true" />
                    {game.time}
                  </div>
                  <div className="recent-detail">
                    <Crosshair size={14} aria-hidden="true" />
                    {game.moves} moves
                  </div>
                  <div className="recent-detail recent-mistakes">
                    {game.mistakes} mistakes
                  </div>
                  <button
                    type="button"
                    className="recent-open"
                    title="Game reports will be added later"
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                    <span className="sr-only">Open game preview</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <p className="profile-disclaimer">
          This profile uses placeholder data for the visual prototype. Real stats will
          come from saved gameplay once the database and Supabase authentication are
          connected.
        </p>
      </main>
    </>
  );
}
