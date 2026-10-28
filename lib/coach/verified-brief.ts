import type { EvidenceReport } from "./evidence-report.ts";
import type { PracticeSession } from "../practice/history";

// Phase 6: the boundary between trusted deterministic analysis and a future AI
// service (FastAPI or a hosted model). The model gets evidence, not the mine
// layout, raw move timeline, checkpoint hashes, or authority to change results.
//
// Note: these are unranked, CLIENT-RECORDED Practice games. Checkpoints catch
// accidental replay mismatches; they are not proof against forged recordings.

export const VERIFIED_BRIEF_VERSION = "1" as const;

export type VerifiedBrief = {
  schemaVersion: typeof VERIFIED_BRIEF_VERSION;
  kind: "verified-practice-coaching-brief";
  game: {
    mode: "practice";
    difficulty: string;
    rows: number;
    columns: number;
    mineCount: number;
    outcome: "win" | "loss";
    durationSeconds: number;
  };
  analysis: {
    recordedActions: number;
    verifiedMistakes: number;
    provenGood: number;
    uncertainActions: number;
    headline: string;
    takeaway: string;
    caveat: string;
  };
  moments: Array<{
    id: string;
    moveNumber: number;
    kind: "mistake" | "good";
    category: string;
    occurrences: number;
    action: string;
    location: string;
    finding: string;
    visibleEvidence: string;
    nextTime: string;
  }>;
  allowedFocusIds: string[];
  allowedStyles: ["direct", "step-by-step"];
  aiRules: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Validate one finished, checkpoint-stamped Practice recording received by an
 * untrusted HTTP endpoint. This intentionally does NOT accept legacy unstamped
 * recordings: an AI-bound brief should have a check at every recorded action.
 */
export function parseVerifiedPracticeRecording(raw: unknown): PracticeSession {
  if (!isObject(raw)) throw new Error("A Practice game object is required.");

  const { rows, columns, mineCount, durationSeconds, difficulty, outcome } = raw;
  if (
    raw.game !== "minesweeper" ||
    !integer(rows, 2, 50) ||
    !integer(columns, 2, 50) ||
    rows * columns > 600 ||
    !integer(mineCount, 0, rows * columns - 1) ||
    !integer(durationSeconds, 0, 604800) ||
    typeof difficulty !== "string" ||
    !/^[A-Za-z0-9 _-]{1,32}$/.test(difficulty) ||
    (outcome !== "win" && outcome !== "loss")
  ) {
    throw new Error("Invalid Practice game metadata.");
  }

  const total = rows * columns;
  const mines = raw.mines;
  if (
    !Array.isArray(mines) ||
    mines.length !== mineCount ||
    !mines.every((index) => integer(index, 0, total - 1)) ||
    new Set(mines).size !== mineCount
  ) {
    throw new Error("The mine layout is invalid.");
  }

  const moves = raw.moves;
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > 1500) {
    throw new Error("The action list is missing or too long.");
  }

  let lastTime = 0;
  const checkedMoves = moves.map((move, index) => {
    if (
      !isObject(move) ||
      !integer(move.row, 0, rows - 1) ||
      !integer(move.col, 0, columns - 1) ||
      !["reveal", "flag", "unflag", "chord"].includes(String(move.action)) ||
      !integer(move.atMs, lastTime, durationSeconds * 1000 + 999) ||
      typeof move.afterHash !== "string" ||
      !/^[0-9a-f]{8}$/.test(move.afterHash)
    ) {
      throw new Error(`Invalid or missing move checkpoint at action ${index + 1}.`);
    }
    lastTime = move.atMs;
    return {
      row: move.row as number,
      col: move.col as number,
      action: move.action as "reveal" | "flag" | "unflag" | "chord",
      atMs: move.atMs as number,
      afterHash: move.afterHash as string,
    };
  });

  // Construct a new known-shape object, never forward extra client fields.
  return {
    game: "minesweeper",
    difficulty,
    rows,
    columns,
    mineCount,
    outcome,
    durationSeconds,
    mines: [...mines] as number[],
    moves: checkedMoves,
  };
}

/**
 * Project ONLY already verified report fields into an AI-neutral payload.
 * Call buildEvidenceReport(game) BEFORE this function to validate replay,
 * per-move checksums, and the claimed outcome.
 */
export function makeVerifiedBrief(
  game: Pick<
    PracticeSession,
    "difficulty" | "rows" | "columns" | "mineCount" | "outcome" | "durationSeconds"
  >,
  report: EvidenceReport,
): VerifiedBrief {
  if (report.moments.length > 5) {
    throw new Error("Verified reports may contain at most five focus moments.");
  }
  const ids = report.moments.map((moment) => moment.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Verified moment IDs must be unique.");
  }
  return {
    schemaVersion: VERIFIED_BRIEF_VERSION,
    kind: "verified-practice-coaching-brief",
    game: {
      mode: "practice",
      difficulty: game.difficulty,
      rows: game.rows,
      columns: game.columns,
      mineCount: game.mineCount,
      outcome: game.outcome,
      durationSeconds: game.durationSeconds,
    },
    analysis: {
      recordedActions: report.recordedActions,
      verifiedMistakes: report.verifiedMistakes,
      provenGood: report.provenGood,
      uncertainActions: report.uncertainActions,
      headline: report.headline,
      takeaway: report.takeaway,
      caveat: report.caveat,
    },
    moments: report.moments.map((moment) => ({
      id: moment.id,
      moveNumber: moment.moveNumber,
      kind: moment.kind,
      category: moment.category,
      occurrences: moment.occurrences,
      action: moment.action,
      location: moment.location,
      finding: moment.finding,
      visibleEvidence: moment.evidence,
      nextTime: moment.nextTime,
    })),
    allowedFocusIds: ids,
    allowedStyles: ["direct", "step-by-step"],
    aiRules: [
      "Select only an existing allowedFocusId and allowedStyle.",
      "Do not invent moves, mistakes, statistics, confidence scores, or board facts.",
      "Do not alter classifications, game outcomes, or official player data.",
      "Unclassified moves are uncertain, not proven mistakes or unavoidable guesses.",
    ],
  };
}

/** Accept only a tightly constrained provider choice, never provider prose. */
export function validateBackendFocusReply(
  brief: VerifiedBrief,
  raw: unknown,
): { focusId: string; style: "direct" | "step-by-step" } | null {
  if (!isObject(raw)) return null;
  if (Object.keys(raw).some((key) => key !== "focusId" && key !== "style")) {
    return null;
  }
  if (
    typeof raw.focusId !== "string" ||
    !brief.allowedFocusIds.includes(raw.focusId) ||
    (raw.style !== "direct" && raw.style !== "step-by-step")
  ) {
    return null;
  }
  return { focusId: raw.focusId, style: raw.style };
}
