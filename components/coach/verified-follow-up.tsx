"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, MessageCircleQuestion, ShieldCheck } from "lucide-react";

import {
  answerVerifiedFollowUp,
  SUGGESTED_QUESTIONS,
  type FollowUpAnswer,
} from "@/lib/coach/verified-follow-up";
import type { EvidenceReport } from "@/lib/coach/evidence-report";
import type { PracticeSession } from "@/lib/practice/history";

// Keep one answered question per recording during the browser-tab session.
// No user question or mine layout is sent to an API.
const STORAGE_PREFIX = "mindsweeper.practice.verifiedFollowUp.v1.";

export function followUpGameKey(game: PracticeSession): string {
  // Non-security hash: a compact identifier for temporary session storage.
  const text = JSON.stringify(game);
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16);
}

export function VerifiedFollowUp({
  report,
  game,
  onReviewMove,
}: {
  report: EvidenceReport;
  game: PracticeSession;
  onReviewMove: (moveNumber: number) => void;
}) {
  const [momentId, setMomentId] = useState(report.moments[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<FollowUpAnswer | null>(null);
  const [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = STORAGE_PREFIX + followUpGameKey(game);

  useEffect(() => {
    // The first render is intentionally empty until we load the tab's record.
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (saved && typeof saved === "object") {
          const entry = saved as { momentId?: unknown; question?: unknown };
          if (typeof entry.momentId === "string" && typeof entry.question === "string") {
            const result = answerVerifiedFollowUp(report, entry.momentId, entry.question);
            if (result.supported) {
              setMomentId(entry.momentId);
              setQuestion(entry.question);
              setAnswer(result.answer);
            }
          }
        }
      }
    } catch {
      // Storage can be disabled. The question still works for this page view.
    }
    setStorageReady(true);
  }, [report, storageKey]);

  if (report.moments.length === 0) {
    return (
      <section className="verified-follow-up" aria-label="Coaching follow-up">
        <h4>
          <MessageCircleQuestion size={19} aria-hidden="true" /> Ask about a verified move
        </h4>
        <p>
          There isn't a verified coaching moment to ask about in this game. We won't
          invent an explanation for an uncertain move.
        </p>
      </section>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storageReady || answer) return;
    const result = answerVerifiedFollowUp(report, momentId, question);
    if (!result.supported) {
      setNotice(result.message);
      return;
    }
    setNotice("");
    setAnswer(result.answer);
    onReviewMove(result.answer.moveNumber);
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ momentId, question: result.answer.question }),
      );
    } catch {
      // Do not interrupt a coaching answer if tab storage is unavailable.
    }
  }

  const selected = report.moments.find((item) => item.id === momentId);
  return (
    <section className="verified-follow-up" aria-label="One coaching follow-up">
      <div className="follow-up-title-row">
        <h4>
          <MessageCircleQuestion size={19} aria-hidden="true" /> Ask one follow-up
          question
        </h4>
        <span>
          <ShieldCheck size={13} aria-hidden="true" /> Verified rule answer
        </span>
      </div>
      <p>
        Choose a recorded coaching moment and ask one question about it. This works
        without an OpenAI key and uses only facts already verified by your board replay.
      </p>
      {!answer ? (
        <form onSubmit={submit} className="follow-up-form">
          <label htmlFor="follow-up-moment">Which move?</label>
          <select
            id="follow-up-moment"
            value={momentId}
            onChange={(event) => {
              setMomentId(event.target.value);
              setNotice("");
            }}
          >
            {report.moments.map((moment) => (
              <option key={moment.id} value={moment.id}>
                Move {moment.moveNumber} — {moment.category}
              </option>
            ))}
          </select>
          <label htmlFor="follow-up-question">Your question</label>
          <textarea
            id="follow-up-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setNotice("");
            }}
            placeholder="Why was this decision classified this way?"
            maxLength={240}
            rows={2}
            required
          />
          <div className="follow-up-suggestions" aria-label="Example questions">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  setNotice("");
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
          {selected && (
            <p className="follow-up-context">
              Selected: move {selected.moveNumber}, {selected.location}
            </p>
          )}
          {notice && (
            <p className="follow-up-notice" role="status">
              {notice}
            </p>
          )}
          <button
            className="follow-up-submit"
            type="submit"
            disabled={!storageReady || question.trim().length < 5}
          >
            Ask about this move <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <div className="follow-up-answer" aria-live="polite">
          <span className="subtle-label">YOUR ONE VERIFIED FOLLOW-UP</span>
          <p className="follow-up-asked">“{answer.question}”</p>
          <h5>{answer.title}</h5>
          {answer.paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          <button
            type="button"
            className="evidence-review-button"
            onClick={() => onReviewMove(answer.moveNumber)}
          >
            View move {answer.moveNumber} in replay
          </button>
          <p className="follow-up-context">
            One answer per game in this browser tab. You can still review all the other
            moves in the report.
          </p>
        </div>
      )}
    </section>
  );
}
