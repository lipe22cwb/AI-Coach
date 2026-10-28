"use client";

import { History, Loader2, Play, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CoachReportView } from "@/components/coach/coach-report-view";
import { analyzeGameplay, toRuleReport } from "@/lib/coach/analyze";
import { loadLastGame } from "@/lib/coach/last-game";
import type { StoredLastGame } from "@/lib/coach/last-game";
import { shapeReportForPreferences } from "@/lib/coach/preferences";
import { SAMPLE_LOSS_SESSION, SAMPLE_WIN_SESSION } from "@/lib/coach/sample-session";
import type { CoachResult, GameplaySession } from "@/lib/coach/types";
import { loadCoachPreferences } from "@/lib/settings/coach-preferences";
import { createSettingsRepository } from "@/lib/settings/repository";
import type { CoachPreferences } from "@/lib/settings/types";

// The interactive part of the Coaching tab. It asks the API for the report and,
// if the API is unreachable (for example on a static host), runs the same rule
// engine in the browser so the page still works. A request the server rejected
// (400, 401, 429) is shown as an error instead of being disguised as a local
// report — the same rule the post-game panel under the board follows.
//
// The last completed game from the Play tab is read from localStorage and
// offered as a third action next to the two recorded samples.

type ProviderStatus = {
  configured: boolean;
  provider: { id: string; model: string } | null;
};

const SAMPLES: Array<{ key: string; label: string; session: GameplaySession }> = [
  { key: "loss", label: "Analyze a loss", session: SAMPLE_LOSS_SESSION },
  { key: "win", label: "Analyze a win", session: SAMPLE_WIN_SESSION },
];

const LAST_GAME_KEY = "last";

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "saved recently";
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return "saved just now";
  if (elapsed < 3_600_000) {
    const minutes = Math.floor(elapsed / 60_000);
    return `saved ${minutes} min ago`;
  }
  if (elapsed < 86_400_000) {
    const hours = Math.floor(elapsed / 3_600_000);
    return `saved ${hours} h ago`;
  }
  return `saved ${date.toLocaleDateString()}`;
}

function describeLastGame({ session, savedAt }: StoredLastGame): string {
  const outcome =
    session.outcome === "win"
      ? "win"
      : session.outcome === "loss"
        ? "loss"
        : "in progress";
  const board =
    session.rows && session.columns ? `${session.rows} × ${session.columns}` : null;
  const duration =
    session.durationSeconds !== undefined ? `${session.durationSeconds}s` : null;
  return [
    session.difficulty ?? "Minesweeper",
    board,
    outcome,
    duration,
    formatSavedAt(savedAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function CoachConsole() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<CoachPreferences | null>(null);
  const [lastGame, setLastGame] = useState<StoredLastGame | null>(null);
  const [lastGameLoaded, setLastGameLoaded] = useState(false);

  // The Play tab saves the last completed game in localStorage. Read it on
  // mount, and refresh if another tab finishes a game while this page is open.
  useEffect(() => {
    const refresh = () => setLastGame(loadLastGame());
    refresh();
    setLastGameLoaded(true);
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  // Read the saved Settings coaching preferences through the shared
  // SettingsRepository contract. If settings cannot be read, the request goes
  // out without them and the API applies the documented defaults.
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
      setLoadingKey(key);
      setError(null);
      setResult(null);
      const payload: GameplaySession = preferences
        ? { ...session, preferences }
        : session;
      let rejected: string | null = null;
      try {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          rejected = body?.error ?? `The coaching API replied with ${response.status}.`;
          throw new Error(rejected);
        }
        setResult((await response.json()) as CoachResult);
      } catch {
        // A rejection is the server's answer, not a network failure: show it
        // instead of pretending the rule engine answered locally.
        if (rejected) {
          setError(rejected);
          return;
        }
        // Fall back to the rule engine running in this browser.
        const report = toRuleReport(analyzeGameplay(payload));
        setResult({
          report: preferences ? shapeReportForPreferences(report, preferences) : report,
          fallbackReason:
            "The coaching API could not be reached, so the built-in rule coach ran in your browser.",
        });
      } finally {
        setLoadingKey(null);
      }
    },
    [preferences],
  );

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
          Analyse your last completed game, or pick one of the recorded samples. The rule
          engine replays every move; if an AI provider is configured, it rewrites the same
          findings in friendlier words.
        </p>

        <span className="coach-provider" data-ready={status?.configured ? "yes" : "no"}>
          <Sparkles size={13} aria-hidden="true" />
          {providerLine}
        </span>

        {lastGame ? (
          <div className="coach-last-game">
            <span className="subtle-label">Your last completed game</span>
            <p className="coach-last-meta">{describeLastGame(lastGame)}</p>
            <button
              type="button"
              className="coach-btn"
              onClick={() => analyze(LAST_GAME_KEY, lastGame.session)}
              disabled={loadingKey !== null}
            >
              {loadingKey === LAST_GAME_KEY ? (
                <Loader2 className="coach-spin" size={16} aria-hidden="true" />
              ) : (
                <History size={15} aria-hidden="true" />
              )}
              Analyze my last game
            </button>
          </div>
        ) : lastGameLoaded ? (
          <p className="coach-last-empty">
            Finish a game on the Play tab and it will appear here.
          </p>
        ) : null}

        <div className="coach-actions">
          <span className="coach-actions-label">
            {lastGame ? "Or try a sample" : "Try a sample"}
          </span>
          {SAMPLES.map(({ key, label, session }) => (
            <button
              key={key}
              type="button"
              className="coach-btn secondary"
              onClick={() => analyze(key, session)}
              disabled={loadingKey !== null}
            >
              {loadingKey === key ? (
                <Loader2 className="coach-spin" size={16} aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
              {label}
            </button>
          ))}
        </div>

        <ul className="coach-help">
          <li>The samples are 9 × 9; every board up to 16 × 30 is supported.</li>
          <li>The “Analyze a loss” game hides a guaranteed safe move.</li>
          <li>Your last completed game is stored in this browser only.</li>
          <li>Nothing leaves your browser except the game you send.</li>
          {preferences ? (
            <li>
              Settings applied: {preferences.coachingStyle} tone,{" "}
              {preferences.explanationDetail} detail.
            </li>
          ) : null}
        </ul>
      </section>

      <section aria-label="Coaching report" aria-live="polite">
        {loadingKey ? (
          <div className="coach-placeholder">
            <Loader2 className="coach-spin" size={22} aria-hidden="true" />
            <p>Analysing the game…</p>
          </div>
        ) : error ? (
          <div className="coach-placeholder coach-placeholder-error">
            <TriangleAlert size={22} aria-hidden="true" />
            <p>{error}</p>
          </div>
        ) : result ? (
          <div className="coach-report-panel">
            <CoachReportView
              report={result.report}
              fallbackReason={result.fallbackReason}
            />
          </div>
        ) : (
          <div className="coach-placeholder">
            <Sparkles size={22} aria-hidden="true" />
            <p>Choose a game on the left to see the coach&apos;s feedback.</p>
          </div>
        )}
      </section>
    </div>
  );
}
