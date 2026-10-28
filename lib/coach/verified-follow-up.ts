import type { EvidenceReport, ReportMoment } from "./evidence-report.ts";

// Phase 4: one evidence-grounded question about ONE reported move.
// These responses are assembled from verified findings; no AI key is needed.
// Open-ended interpretations and hypothetical counterfactuals are intentionally
// not answered because the replay does not verify them.

export type QuestionIntent = "why" | "evidence" | "next";
export type FollowUpAnswer = {
  momentId: string;
  moveNumber: number;
  intent: QuestionIntent;
  question: string;
  title: string;
  paragraphs: string[];
};
export type FollowUpResult =
  | { supported: true; answer: FollowUpAnswer }
  | { supported: false; message: string };

export const SUGGESTED_QUESTIONS = [
  "Why was this decision classified this way?",
  "What did the visible board prove?",
  "What should I try next time?",
] as const;

/** The text is only used to recognize one of three safe, rule-backed intents. */
export function classifyVerifiedQuestion(question: string): QuestionIntent | null {
  const text = question.trim().toLowerCase();
  if (text.length < 5 || text.length > 240) return null;

  // We cannot establish counterfactual timelines from a single verified move.
  if (
    /\b(what if|would (i|it|the|this)|if i (had|did)|hypothetical|predict|chance|probabilit|odds)\b/i.test(
      text,
    )
  ) {
    return null;
  }

  if (
    /\b(what (should|could) i (do|try)|next time|improv\w*|practic\w*|instead|avoid|do better|recommend\w*|tip\b|advice|strategy)\b/i.test(
      text,
    )
  ) {
    return "next";
  }
  if (
    /\b(prov\w*|proof|evidence|certain|guaranteed|visible|numbers?|deduc\w*|how (did|do|can) (you|we|the board) know|how (was|is) (this|it) (known|proven))\b/i.test(
      text,
    )
  ) {
    return "evidence";
  }
  if (
    /\b(why|explain|mistake|wrong|good|strong|decision|classif\w*|mean|happen\w*)\b/i.test(
      text,
    )
  ) {
    return "why";
  }
  return null;
}

function answerForMoment(
  moment: ReportMoment,
  intent: QuestionIntent,
  question: string,
): FollowUpAnswer {
  const reference = `Move ${moment.moveNumber} at ${moment.location}`;
  if (intent === "evidence") {
    return {
      momentId: moment.id,
      moveNumber: moment.moveNumber,
      intent,
      question,
      title: "What the board proved",
      paragraphs: [
        `${reference}: ${moment.finding}`,
        `The verified deduction was: ${moment.evidence}`,
        "This proof uses only the squares and numbers visible before that move. It does not rely on the hidden mine positions to judge the decision.",
      ],
    };
  }
  if (intent === "next") {
    return {
      momentId: moment.id,
      moveNumber: moment.moveNumber,
      intent,
      question,
      title: "What to try next time",
      paragraphs: [
        `${reference} is an example of ${moment.category.toLowerCase()}.`,
        moment.nextTime,
        "Look for a similar visible-board situation in your next game. This recommendation is based on this recorded decision, not a claim about your overall skill.",
      ],
    };
  }
  return {
    momentId: moment.id,
    moveNumber: moment.moveNumber,
    intent,
    question,
    title:
      moment.kind === "mistake"
        ? "Why this was a verified mistake"
        : "Why this was a proven good move",
    paragraphs: [
      `${reference}: ${moment.finding}`,
      `The evidence available at the time was: ${moment.evidence}`,
      `A useful next step: ${moment.nextTime}`,
    ],
  };
}

export function answerVerifiedFollowUp(
  report: EvidenceReport,
  momentId: string,
  question: string,
): FollowUpResult {
  const moment = report.moments.find((item) => item.id === momentId);
  if (!moment) {
    return {
      supported: false,
      message: "That move isn't one of the verified coaching moments in this report.",
    };
  }
  const intent = classifyVerifiedQuestion(question);
  if (!intent) {
    return {
      supported: false,
      message:
        "I can't verify an answer to that question from the recorded move. Try asking why the move was classified this way, what the visible board proved, or what to try next time. Unsupported questions do not use your one follow-up.",
    };
  }
  return { supported: true, answer: answerForMoment(moment, intent, question.trim()) };
}
