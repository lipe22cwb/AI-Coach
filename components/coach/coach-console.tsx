"use client";

import { History, Loader2, Play, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CoachReportView } from "@/components/coach/coach-report-view";
import { EvidenceCoachPanel } from "@/components/coach/evidence-coach-panel";
import { VerifiedReplayPanel } from "@/components/coach/verified-replay-panel";
import { analyzeGameplay, toRuleReport } from "@/lib/coach/analyze";
import { loadLastGame } from "@/lib/coach/last-game";
import type { StoredLastGame } from "@/lib/coach/last-game";
import { shapeReportForPreferences } from "@/lib/coach/preferences";
import { loadCoachPreferences } from "@/lib/settings/coach-preferences";
import { createSettingsRepository } from "@/lib/settings/repository";
import type { CoachPreferences } from "@/lib/settings/types";
import { SAMPLE_LOSS_SESSION, SAMPLE_WIN_SESSION } from "@/lib/coach/sample-session";
import type { CoachResult, GameplaySession } from "@/lib/coach/types";
import type { PracticeSession } from "@/lib/practice/history";
import {
  createPracticeRepository,
  type PracticeRepository,
} from "@/lib/practice/repository";

type ProviderStatus = {
  configured: boolean;
  provider: { id: string; model: string } | null;
};

type RecordedGame = {
  session: GameplaySession | null;
  practice: PracticeSession;
  summary: string;
};

const SAMPLES: Array<{ key: string; label: string; session: GameplaySession }> = [
  { key: "loss", label: "Analyze a loss", session: SAMPLE_LOSS_SESSION },
  { key: "win", label: "Analyze a win", session: SAMPLE_WIN_SESSION },
];

async function loadSelectedPracticeGame(
  repository: PracticeRepository,
  gameId: string | null,
): Promise<{
  game: RecordedGame | null;
  message: string;
}> {
  // Use the same validated temporary-session store as the Practice Review page.
  // The id is optional; no id means the latest completed Practice game.
  const value = await repository.load(gameId);
  if (!value) {
    return {
      game: null,
      message: gameId
        ? "That game is no longer in this browser tab's recent recordings."
        : "Finish a Practice game first to unlock your own coaching report.",
    };
  }

  // The modern Coach API supports rectangular boards, including Expert.
  const squareSession: GameplaySession = {
    game: "minesweeper",
    difficulty: value.difficulty,
    rows: value.rows,
    columns: value.columns,
    mineCount: value.mineCount,
    outcome: value.outcome,
    durationSeconds: value.durationSeconds,
    mines: value.mines,
    moves: value.moves,
  };

  return {
    game: {
      session: squareSession,
      practice: value,
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
  const [preferences, setPreferences] = useState<CoachPreferences | null>(null);
  const [classicLastGame, setClassicLastGame] = useState<StoredLastGame | null>(null);
  const [lastGame, setLastGame] = useState<RecordedGame | null>(null);
  const [selectedReplay, setSelectedReplay] = useState<PracticeSession | null>(null);
  const [replayFocus, setReplayFocus] = useState<{
    moveNumber: number;
    request: number;
  } | null>(null);
  const chooseReplayMove = useCallback((moveNumber: number) => {
    setReplayFocus((previous) => ({ moveNumber, request: (previous?.request ?? 0) + 1 }));
  }, []);
  const [practiceMessage, setPracticeMessage] = useState("");
  const autoAnalysisStarted = useRef(false);
  const practiceRepository = useMemo(() => createPracticeRepository(), []);

  // Retain the original last-game localStorage and cross-tab updates.
  useEffect(() => {
    const refresh = () => setClassicLastGame(loadLastGame());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    let alive = true;
    loadCoachPreferences(createSettingsRepository())
      .then((loaded) => {
        if (alive) setPreferences(loaded);
      })
      .catch(() => {
        if (alive) setPreferences(null);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const analyze = useCallback(
    async (key: string, session: GameplaySession) => {
      const payload: GameplaySession = preferences
        ? { ...session, preferences }
        : session;
      setLoadingKey(key);
      setError(null);
      setResult(null);
      try {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
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
          report: preferences
            ? shapeReportForPreferences(
                toRuleReport(analyzeGameplay(payload)),
                preferences,
              )
            : toRuleReport(analyzeGameplay(payload)),
          fallbackReason:
            "The coaching API could not be reached, so the built-in rule coach ran in your browser.",
        });
      } finally {
        setLoadingKey(null);
      }
    },
    [preferences],
  );

  // A finished Practice match links here with ?source=practice. Automatically
  // analyse it once on arrival; the player can rerun the report using the button.
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    void loadSelectedPracticeGame(practiceRepository, params.get("gameId"))
      .then((saved) => {
        if (!active) return;
        setLastGame(saved.game);
        setPracticeMessage(saved.message);

        if (params.get("source") === "practice" && !autoAnalysisStarted.current) {
          autoAnalysisStarted.current = true;
          if (saved.game) {
            setSelectedReplay(saved.game.practice);
          } else {
            setError(saved.message);
          }
        }
      })
      .catch(() => {
        if (!active) return;
        const message =
          "Could not load this Practice recording. Check your connection and try again.";
        setPracticeMessage(message);
        if (params.get("source") === "practice") setError(message);
      });
    return () => {
      active = false;
    };
  }, [practiceRepository]);

  let providerLine: string;
  if (statusUnavailable) {
    providerLine = "Verified coaching works locally · AI status unavailable";
  } else if (status?.configured && status.provider) {
    providerLine = `AI provider ready · ${status.provider.id} · ${status.provider.model}`;
  } else if (status) {
    providerLine = "Verified rule coaching ready · AI focus selection optional";
  } else {
    providerLine = "Checking the coaching API…";
  }

  return (
    <div className="coach-layout">
      <section className="coach-controls" aria-label="Run a coaching analysis">
        <span className="subtle-label">Gameplay analyser</span>
        <h2>Review a finished Practice game.</h2>
        <p className="coach-controls-copy">
          Review your recorded moves, inspect the visible-board evidence, and ask one
          follow-up question. AI prioritization is optional; prototype sample reports are
          clearly separated below.
        </p>

        <span className="coach-provider" data-ready={status?.configured ? "yes" : "no"}>
          <Sparkles size={13} aria-hidden="true" />
          {providerLine}
        </span>

        <p className="coach-controls-copy">
          {lastGame ? `Selected Practice game: ${lastGame.summary}` : practiceMessage}
        </p>

        <div className="coach-actions">
          {classicLastGame && (
            <button
              type="button"
              className="coach-btn secondary"
              onClick={() => {
                setSelectedReplay(null);
                setReplayFocus(null);
                void analyze("classic", classicLastGame.session);
              }}
              disabled={loadingKey !== null}
            >
              <History size={15} aria-hidden="true" />
              Analyze last game (classic report)
            </button>
          )}
          {lastGame && (
            <button
              type="button"
              className="coach-btn"
              onClick={() => {
                setSelectedReplay(lastGame.practice);
                setReplayFocus(null);
                setResult(null);
                setError(null);
              }}
              disabled={loadingKey !== null}
            >
              {loadingKey === "practice" ? (
                <Loader2 className="coach-spin" size={16} aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
              Review Verified Game
            </button>
          )}
        </div>

        <details className="coach-demo-tests">
          <summary>Experimental sample reports (not verified)</summary>
          <p>
            These examples use the earlier scoring engine for comparison, not your
            recorded game. Results may be approximate or unsupported.
          </p>
          <div className="coach-actions">
            {SAMPLES.map(({ key, label, session }) => (
              <button
                key={key}
                type="button"
                className="coach-btn"
                onClick={() => {
                  setSelectedReplay(null);
                  setReplayFocus(null);
                  void analyze(key, session);
                }}
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
        </details>

        <ul className="coach-help">
          <li>
            Finish any Practice game to replay verified board decisions, including Expert.
          </li>
          <li>
            Up to five recent Practice games are stored temporarily in this browser tab.
          </li>
          {preferences ? (
            <li>
              Classic Coach settings: {preferences.coachingStyle} tone,{" "}
              {preferences.explanationDetail} detail.
            </li>
          ) : null}
          <li>
            The verified teaching report runs locally. Optional AI focus selection sends
            verified findings to the provider, never the hidden mine layout. The older
            experimental report is separate and unverified.
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
        {selectedReplay ? (
          <>
            <EvidenceCoachPanel game={selectedReplay} onReviewMove={chooseReplayMove} />
            <VerifiedReplayPanel
              game={selectedReplay}
              focusMoveNumber={replayFocus?.moveNumber}
              focusRequestId={replayFocus?.request}
            />
            {lastGame?.session ? (
              <details className="verified-experimental">
                <summary>Earlier AI coach draft (experimental)</summary>
                <p>
                  This older report uses simpler analysis and a prototype grade. Its
                  scores and claims are not evidence-verified. It runs only if you request
                  it, and may call your configured AI provider.
                </p>
                <button
                  type="button"
                  className="coach-btn"
                  disabled={loadingKey !== null}
                  onClick={() => {
                    if (lastGame?.session) void analyze("practice", lastGame.session);
                  }}
                >
                  {loadingKey === "practice"
                    ? "Preparing draft…"
                    : "Run experimental report"}
                </button>
                {result ? (
                  <div className="coach-report-panel">
                    <CoachReportView
                      report={result.report}
                      fallbackReason={result.fallbackReason}
                    />
                  </div>
                ) : null}
              </details>
            ) : null}
          </>
        ) : result ? (
          <>
            <p className="verified-note">
              Demo report using the previous experimental scoring engine; it is not a
              verified coaching report.
            </p>
            <div className="coach-report-panel">
              <CoachReportView
                report={result.report}
                fallbackReason={result.fallbackReason}
              />
            </div>
          </>
        ) : (
          <div className="coach-placeholder">
            <Sparkles size={22} aria-hidden="true" />
            <p>
              {loadingKey
                ? "Analyzing a sample game…"
                : "Choose a recorded Practice game to see verified coaching."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
