"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { CoachReportView } from "@/components/coach/coach-report-view";
import { analyzeGameplay, toRuleReport } from "@/lib/coach/analyze";
import { shapeReportForPreferences } from "@/lib/coach/preferences";
import type { CoachResult, GameplaySession } from "@/lib/coach/types";
import { loadCoachPreferences } from "@/lib/settings/coach-preferences";
import { createSettingsRepository } from "@/lib/settings/repository";
import type { CoachPreferences } from "@/lib/settings/types";

// Shown under the board as soon as a game ends. It sends the recorded game to
// the coaching API automatically, so the player does not have to copy anything
// or rely on the demo sessions. If the API is unreachable it runs the same rule
// engine in the browser; a rejected request is shown as an error instead of
// being disguised as a report.

export function GameCoachReport({ session }: { session: GameplaySession }) {
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setResult(null);

    async function run() {
      let preferences: CoachPreferences | null = null;
      try {
        preferences = await loadCoachPreferences(createSettingsRepository());
      } catch {
        preferences = null;
      }

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
        const data = (await response.json()) as CoachResult;
        if (alive) setResult(data);
      } catch {
        if (!alive) return;
        if (rejected) {
          setError(rejected);
          return;
        }
        const report = toRuleReport(analyzeGameplay(payload));
        setResult({
          report: preferences ? shapeReportForPreferences(report, preferences) : report,
          fallbackReason:
            "The coaching API could not be reached, so the built-in rule coach ran in your browser.",
        });
      } finally {
        if (alive) setLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [session]);

  return (
    <section
      className="game-coach-report"
      aria-label="Coaching report for your last game"
      aria-live="polite"
    >
      <span className="subtle-label">Your last game</span>
      {loading ? (
        <p className="coach-loading">
          <Loader2 className="coach-spin" size={16} aria-hidden="true" />
          Analysing your game…
        </p>
      ) : null}
      {!loading && error ? (
        <p className="coach-error">
          <TriangleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {!loading && result ? (
        <div className="coach-report-panel">
          <CoachReportView
            report={result.report}
            fallbackReason={result.fallbackReason}
          />
        </div>
      ) : null}
    </section>
  );
}
