"use client";

import { Loader2, Play, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CoachReportView } from "@/components/coach/coach-report-view";
import { analyzeGameplay, toRuleReport } from "@/lib/coach/analyze";
import { SAMPLE_LOSS_SESSION, SAMPLE_WIN_SESSION } from "@/lib/coach/sample-session";
import type { CoachResult, GameplaySession } from "@/lib/coach/types";

// The interactive part of the Coaching tab. It asks the API for the report and,
// if the API is unreachable (for example on a static host), runs the same rule
// engine in the browser so the page still works.

type ProviderStatus = {
  configured: boolean;
  provider: { id: string; model: string } | null;
};

const SAMPLES: Array<{ key: string; label: string; session: GameplaySession }> = [
  { key: "loss", label: "Analyze a loss", session: SAMPLE_LOSS_SESSION },
  { key: "win", label: "Analyze a win", session: SAMPLE_WIN_SESSION },
];

export function CoachConsole() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(
          payload?.error ?? `The coaching API replied with ${response.status}.`,
        );
      }
      setResult((await response.json()) as CoachResult);
    } catch {
      // Fall back to the rule engine running in this browser.
      setResult({
        report: toRuleReport(analyzeGameplay(session)),
        fallbackReason:
          "The coaching API could not be reached, so the built-in rule coach ran in your browser.",
      });
    } finally {
      setLoadingKey(null);
    }
  }, []);

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
          Pick a recorded game below. The rule engine replays every move; if an AI
          provider is configured, it rewrites the same findings in friendlier words.
        </p>

        <span className="coach-provider" data-ready={status?.configured ? "yes" : "no"}>
          <Sparkles size={13} aria-hidden="true" />
          {providerLine}
        </span>

        <div className="coach-actions">
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
              {label}
            </button>
          ))}
        </div>

        <ul className="coach-help">
          <li>9 × 9 board, 10 mines, with the mine layout included.</li>
          <li>The “Analyze a loss” game hides a guaranteed safe move.</li>
          <li>Nothing leaves the server except the game you send.</li>
        </ul>

        {error ? (
          <p className="coach-error">
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
            <p>Choose a game on the left to see the coach&apos;s feedback.</p>
          </div>
        )}
      </section>
    </div>
  );
}
