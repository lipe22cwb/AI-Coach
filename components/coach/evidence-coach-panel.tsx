"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Target,
  TriangleAlert,
} from "lucide-react";

import { buildEvidenceReport } from "@/lib/coach/evidence-report";
import { VerifiedFollowUp, followUpGameKey } from "@/components/coach/verified-follow-up";
import type { PracticeSession } from "@/lib/practice/history";

type FocusResponse = {
  focusId: string | null;
  style: "direct" | "step-by-step";
  selectedBy: string;
  model: string | null;
  note: string;
};

export function EvidenceCoachPanel({
  game,
  onReviewMove,
}: {
  game: PracticeSession;
  onReviewMove: (moveNumber: number) => void;
}) {
  const prepared = useMemo(() => {
    try {
      return { report: buildEvidenceReport(game), error: null };
    } catch (error) {
      return {
        report: null,
        error: error instanceof Error ? error.message : "Unable to verify this game.",
      };
    }
  }, [game]);
  const [focus, setFocus] = useState<FocusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    pending.current?.abort();
    setFocus(null);
    setLoading(false);
    setError("");
    return () => pending.current?.abort();
  }, [game]);

  const report = prepared.report;
  if (!report) {
    return (
      <section className="evidence-report" aria-label="Verified coaching">
        <h3>Evidence-based coaching</h3>
        <p role="alert">{prepared.error}</p>
      </section>
    );
  }

  async function requestAIFocus() {
    if (!report || loading || report.moments.length === 0) return;
    const controller = new AbortController();
    pending.current?.abort();
    pending.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/coach/verified", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(game),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | (FocusResponse & { error?: string })
        | null;
      if (!response.ok) throw new Error(body?.error ?? "Unable to request AI focus.");
      if (
        !body ||
        (body.focusId !== null &&
          !report.moments.some((item) => item.id === body.focusId))
      ) {
        throw new Error("The AI suggestion was not based on a verified moment.");
      }
      if (!controller.signal.aborted) {
        setFocus(body);
        const chosen = report.moments.find((moment) => moment.id === body.focusId);
        if (chosen) onReviewMove(chosen.moveNumber);
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "AI focus was unavailable.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const focused =
    report.moments.find((moment) => moment.id === focus?.focusId) ?? report.moments[0];
  const isAI = focus && focus.selectedBy !== "rules";

  return (
    <section className="evidence-report" aria-label="Evidence-based coaching report">
      <div className="evidence-heading">
        <div>
          <span className="subtle-label">VERIFIED POST-GAME REPORT · PRACTICE</span>
          <h3>
            <BrainCircuit size={22} aria-hidden="true" /> {report.headline}
          </h3>
        </div>
        <span className="evidence-lock">
          <ShieldCheck size={14} aria-hidden="true" /> Rule-verified
        </span>
      </div>

      <p className="evidence-takeaway">
        <strong>Game takeaway:</strong> {report.takeaway}
      </p>
      <div className="evidence-counts">
        <span>
          <strong>{report.recordedActions}</strong> recorded actions
        </span>
        <span>
          <strong>{report.verifiedMistakes}</strong> verified mistakes
        </span>
        <span>
          <strong>{report.provenGood}</strong> proven good moves
        </span>
        <span>
          <strong>{report.uncertainActions}</strong> insufficient evidence
        </span>
      </div>

      <div className="evidence-focus-row">
        <div>
          <strong>Choose your next focus</strong>
          <p>
            The rule engine selects a starting point. AI can optionally prioritize one of
            these same verified moments; it cannot invent findings.
          </p>
        </div>
        <button
          type="button"
          className="evidence-ai-button"
          disabled={loading || report.moments.length === 0}
          onClick={() => void requestAIFocus()}
        >
          {loading ? (
            <Loader2 size={16} className="coach-spin" aria-hidden="true" />
          ) : (
            <Target size={16} aria-hidden="true" />
          )}
          {loading ? "Checking focus…" : "Ask AI to choose a focus"}
        </button>
      </div>
      {focus && (
        <p className="evidence-ai-note" aria-live="polite">
          {isAI
            ? `AI-selected focus (${focus.selectedBy}${focus.model ? ` · ${focus.model}` : ""})`
            : "Rule-selected focus"}
          . {focus.note}
        </p>
      )}
      {error && (
        <p className="evidence-error" role="alert">
          <TriangleAlert size={14} aria-hidden="true" /> {error} The verified report is
          still available.
        </p>
      )}

      {report.moments.length > 0 ? (
        <div className="evidence-moment-list">
          {report.moments.map((moment) => (
            <article
              key={moment.id}
              className={
                focused?.id === moment.id ? "evidence-moment is-focus" : "evidence-moment"
              }
            >
              <div className="evidence-moment-title">
                <span
                  className={
                    moment.kind === "mistake"
                      ? "evidence-kind mistake"
                      : "evidence-kind good"
                  }
                >
                  {moment.kind === "mistake" ? (
                    <TriangleAlert size={14} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={14} aria-hidden="true" />
                  )}
                  {moment.kind === "mistake" ? "Verified mistake" : "Proven good move"}
                </span>
                <span>
                  Move {moment.moveNumber} · {moment.location}
                  {moment.occurrences > 1
                    ? ` · repeated ${moment.occurrences} times`
                    : ""}
                </span>
              </div>
              <h4>{moment.category}</h4>
              <p>
                <strong>What happened:</strong> {moment.finding}
              </p>
              {(focus?.style !== "direct" || focused?.id === moment.id) && (
                <p>
                  <strong>Visible evidence:</strong> {moment.evidence}
                </p>
              )}
              <p>
                <strong>What to try next:</strong> {moment.nextTime}
              </p>
              <button
                type="button"
                className="evidence-review-button"
                onClick={() => onReviewMove(moment.moveNumber)}
              >
                View board at move {moment.moveNumber}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="evidence-empty">
          This game had no provable coaching moments under the current analysis rules. We
          will not invent five points just to fill the report.
        </p>
      )}
      <VerifiedFollowUp
        key={followUpGameKey(game)}
        report={report}
        game={game}
        onReviewMove={onReviewMove}
      />
      <p className="evidence-caveat">
        {report.caveat} AI prioritization is optional and only sends verified finding
        summaries to the provider, not the hidden mine layout.
      </p>
    </section>
  );
}
