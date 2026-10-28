"use client";

import { Loader2, Play, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CoachReportView } from "@/components/coach/coach-report-view";
import { analyzeGameplay, toRuleReport } from "@/lib/coach/analyze";
import { SAMPLE_LOSS_SESSION, SAMPLE_WIN_SESSION } from "@/lib/coach/sample-session";
import type { CoachResult, GameplaySession } from "@/lib/coach/types";
import { loadPracticeSession } from "@/lib/practice/history";

type ProviderStatus = {
  configured: boolean;
  provider: { id: string; model: string } | null;
};

type RecordedGame = {
  session: GameplaySession;
  summary: string;
};

const SAMPLES: Array<{ key: string; label: string; session: GameplaySession }> = [
  { key: "loss", label: "Analyze a loss", session: SAMPLE_LOSS_SESSION },
  { key: "win", label: "Analyze a win", session: SAMPLE_WIN_SESSION },
];

function loadSelectedPracticeGame(gameId: string | null): {
  game: RecordedGame | null;
  message: string;
} {
  // Use the same validated temporary-session store as the Practice Review page.
  // The id is optional; no id means the latest completed Practice game.
  const value = loadPracticeSession(gameId);
  if (!value) {
    return {
      game: null,
      message: gameId
        ? "That game is no longer in this browser tab's recent recordings."
        : "Finish a Practice game first to unlock your own coaching report.",
    };
  }

  // The current analysis engine expects square boards. Never reshape 16x30
  // Expert data into a false 16x16 board and present invented coaching.
  if (value.rows !== value.columns) {
    return {
      game: null,
      message: `Your ${value.rows} × ${value.columns} ${value.difficulty} game was recorded, but verified coaching for rectangular boards is not available yet.`,
    };
  }

  return {
    game: {
      session: {
        game: "minesweeper",
        difficulty: value.difficulty,
        boardSize: value.rows,
        mineCount: value.mineCount,
        outcome: value.outcome,
        durationSeconds: value.durationSeconds,
        mines: value.mines,
        moves: value.moves,
      },
      summary: `${value.difficulty} · ${value.rows} × ${value.columns} · ${value.outcome === "win" ? "Win" : "Loss"} · ${value.moves.length} actions`,
    },
    message: "",
  };
}

export function CoachConsole() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGame, setLastGame] = useState<RecordedGame | null>(null);
  const [practiceMessage, setPracticeMessage] = useState("");
  const autoAnalysisStarted = useRef(false);

  // Ask the API which provider, if any, is configured. No key is a normal state.
  useEffect(() => {
    let alive = true;
    fetch("/api/coach")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error("status")),
      )
      .then((data: ProviderStatus) => {
        if (alive) setStatus(data);
      })
      .catch(() => {
        if (alive) setStatusUnavailable(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const analyze = useCallback(async (key: string, session: GameplaySession) => {
    setLoadingKey(key);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(session),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Invalid input must be surfaced, not silently reanalysed and treated
        // as a verified report by the browser fallback.
        setError(payload?.error ?? `The coaching API replied with ${response.status}.`);
        return;
      }
      setResult((await response.json()) as CoachResult);
    } catch {
      // Rule analysis can still work locally without an AI provider or server.
      setResult({
        report: toRuleReport(analyzeGameplay(session)),
        fallbackReason:
          "The coaching API could not be reached, so the built-in rule coach ran in your browser.",
      });
    } finally {
      setLoadingKey(null);
    }
  }, []);

  // A finished Practice match links here with ?source=practice. Automatically
  // analyse it once on arrival; the player can rerun the report using the button.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saved = loadSelectedPracticeGame(params.get("gameId"));
    setLastGame(saved.game);
    setPracticeMessage(saved.message);

    if (params.get("source") === "practice" && !autoAnalysisStarted.current) {
      autoAnalysisStarted.current = true;
      if (saved.game) {
        void analyze("practice", saved.game.session);
      } else {
        setError(saved.message);
      }
    }
  }, [analyze]);

  let providerLine: string;
  if (statusUnavailable) {
    providerLine = "Rule coach running in the browser";
  } else if (status?.configured && status.provider) {
    providerLine = `AI provider ready · ${status.provider.id} · ${status.provider.model}`;
  } else if (status) {
    providerLine = "Rule coach only — add an API key to enable AI wording";
  } else {
    providerLine = "Checking the coaching API…";
  }

  return (
    <div className="coach-layout">
      <section className="coach-controls" aria-label="Run a coaching analysis">
        <span className="subtle-label">Gameplay analyser</span>
        <h2>Send a game, get a report.</h2>
        <p className="coach-controls-copy">
          Analyze your latest finished Practice game, or try a sample report. The rule
          engine checks your moves; an optional AI provider rewrites its feedback in
          friendlier words.
        </p>

        <span className="coach-provider" data-ready={status?.configured ? "yes" : "no"}>
          <Sparkles size={13} aria-hidden="true" />
          {providerLine}
        </span>

        <p className="coach-controls-copy">
          {lastGame ? `Selected Practice game: ${lastGame.summary}` : practiceMessage}
        </p>

        <div className="coach-actions">
          {lastGame && (
            <button
              type="button"
              className="coach-btn"
              onClick={() => analyze("practice", lastGame.session)}
              disabled={loadingKey !== null}
            >
              {loadingKey === "practice" ? (
                <Loader2 className="coach-spin" size={16} aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
              Analyze Selected Practice Game
            </button>
          )}
          {SAMPLES.map(({ key, label, session }) => (
            <button
              key={key}
              type="button"
              className="coach-btn"
              onClick={() => analyze(key, session)}
              disabled={loadingKey !== null}
            >
              {loadingKey === key ? (
                <Loader2 className="coach-spin" size={16} aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
              {label} (demo)
            </button>
          ))}
        </div>

        <ul className="coach-help">
          <li>
            Play a Beginner or Intermediate Practice game and finish it to get feedback.
          </li>
          <li>
            Up to five recent Practice games are stored temporarily in this browser tab.
          </li>
          <li>
            Game data goes to the coaching API; if an AI provider is configured, coaching
            findings may also be sent to that provider.
          </li>
        </ul>

        {error ? (
          <p className="coach-error" role="alert">
            <TriangleAlert size={14} aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </section>

      <section aria-label="Coaching report" aria-live="polite">
        {result ? (
          <div className="coach-report-panel">
            <CoachReportView
              report={result.report}
              fallbackReason={result.fallbackReason}
            />
          </div>
        ) : (
          <div className="coach-placeholder">
            <Sparkles size={22} aria-hidden="true" />
            <p>
              {loadingKey
                ? "Analyzing your game…"
                : "Choose a game on the left to see the coach's feedback."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
