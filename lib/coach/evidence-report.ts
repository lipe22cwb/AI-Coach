import {
  replayRecordedGame,
  type ReplayFrame,
  type RecordedGame,
  type Proof,
} from "./verified-replay.ts";

// A short, evidence-first coaching report. Every factual explanation is built
// from the deterministic replay, NOT from an LLM or the hidden mine layout.
// It is safe to use in a browser, tests, or a server endpoint.

export type ReportMoment = {
  id: string;
  moveNumber: number;
  category: string;
  kind: "mistake" | "good";
  occurrences: number;
  action: string;
  location: string;
  finding: string;
  evidence: string;
  nextTime: string;
};

export type EvidenceReport = {
  headline: string;
  takeaway: string;
  recordedActions: number;
  verifiedMistakes: number;
  provenGood: number;
  uncertainActions: number;
  moments: ReportMoment[];
  caveat: string;
};

type ReportGame = RecordedGame & {
  difficulty?: string;
  outcome?: "win" | "loss";
  durationSeconds?: number;
};
type MomentDraft = Omit<ReportMoment, "occurrences"> & { group: string };

function location(index: number, columns: number): string {
  return `row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}`;
}

function firstProof(
  frame: ReplayFrame,
  index: number,
  category: "safe" | "mines",
): Proof | undefined {
  return frame.deductions[category].find((proof) => proof.index === index);
}

function draft(frame: ReplayFrame, columns: number): MomentDraft | null {
  if (!frame.changed || frame.decision === "not-enough-evidence") return null;
  const chosen = frame.move.row * columns + frame.move.col;
  const where = location(chosen, columns);
  const base = {
    id: `move-${frame.actionNumber}`,
    moveNumber: frame.actionNumber,
    action: frame.move.action,
    location: where,
  };

  if (frame.decision === "mistake") {
    if (frame.mistakeType === "unnecessary-guess") {
      const alternative = frame.deductions.safe.find((proof) => proof.index !== chosen);
      if (!alternative) return null; // Fail closed: no supporting alternative.
      return {
        ...base,
        group: "unnecessary-guess",
        kind: "mistake",
        category: "Unnecessary guess",
        finding: `The chosen square (${where}) was uncertain while a guaranteed-safe move existed elsewhere.`,
        evidence: `${location(alternative.index, columns)} was guaranteed safe. ${alternative.reason}`,
        nextTime:
          "Before opening an uncertain square, scan other visible numbers for a guaranteed-safe move.",
      };
    }
    if (frame.mistakeType === "revealed-known-mine") {
      const mine =
        frame.move.action === "chord"
          ? frame.deductions.mines.find((proof) => {
              const cell = frame.after[proof.index];
              const r = Math.floor(proof.index / columns);
              const c = proof.index % columns;
              return (
                Math.abs(r - frame.move.row) <= 1 &&
                Math.abs(c - frame.move.col) <= 1 &&
                cell.revealed &&
                !frame.before[proof.index].revealed &&
                !frame.before[proof.index].flagged
              );
            })
          : firstProof(frame, chosen, "mines");
      if (!mine) return null;
      return {
        ...base,
        group: "revealed-known-mine",
        kind: "mistake",
        category: "Opened a proven mine",
        finding: `The action at ${where} opened a square that the visible board had already proven was mined.`,
        evidence: `${location(mine.index, columns)} was a proven mine. ${mine.reason}`,
        nextTime:
          "Check proven mine positions before opening a square or chording around a number.",
      };
    }
    if (frame.mistakeType === "flagged-known-safe") {
      const safe = firstProof(frame, chosen, "safe");
      if (!safe) return null;
      return {
        ...base,
        group: "flagged-known-safe",
        kind: "mistake",
        category: "Flagged a proven-safe square",
        finding: `A flag was placed at ${where}, even though the visible board proved it was safe.`,
        evidence: safe.reason,
        nextTime: "Only flag a square when the visible numbers prove it contains a mine.",
      };
    }
    return null;
  }

  if (frame.move.action === "flag") {
    const proof = firstProof(frame, chosen, "mines");
    if (!proof) return null;
    return {
      ...base,
      group: "supported-flag",
      kind: "good",
      category: "Correct logical flag",
      finding: `The flag at ${where} was supported by a visible-board deduction.`,
      evidence: proof.reason,
      nextTime:
        "Keep checking the numbers that justify a flag rather than relying on guesses.",
    };
  }
  if (frame.move.action === "reveal") {
    const proof = firstProof(frame, chosen, "safe");
    if (!proof) return null;
    return {
      ...base,
      group: "supported-reveal",
      kind: "good",
      category: "Guaranteed-safe reveal",
      finding: `The reveal at ${where} followed a proven-safe deduction.`,
      evidence: proof.reason,
      nextTime:
        "Continue identifying guaranteed-safe squares before taking uncertain risks.",
    };
  }
  if (frame.move.action === "chord") {
    return {
      ...base,
      group: "supported-chord",
      kind: "good",
      category: "Supported chord",
      finding: `Every covered square opened by this chord at ${where} had been proven safe.`,
      evidence:
        "The visible-board deductions proved all opened squares safe before the chord.",
      nextTime:
        "Use chording when your flags and visible numbers support every square it will open.",
    };
  }
  return null;
}

/** Group repeated mistakes and return at most five distinct, useful moments. */
export function buildEvidenceReport(game: ReportGame): EvidenceReport {
  const replay = replayRecordedGame(game);
  if (game.outcome && replay.status !== (game.outcome === "win" ? "won" : "lost")) {
    throw new Error(
      "Recorded outcome does not match the replay. No coaching report was generated.",
    );
  }
  const changed = replay.frames.filter((frame) => frame.changed);
  const verifiedMistakes = changed.filter((frame) => frame.decision === "mistake").length;
  const provenGood = changed.filter((frame) => frame.decision === "good").length;
  const uncertainActions = changed.filter(
    (frame) => frame.decision === "not-enough-evidence",
  ).length;

  const grouped = new Map<string, { first: MomentDraft; occurrences: number }>();
  for (const frame of replay.frames) {
    const result = draft(frame, game.columns);
    if (!result) continue;
    const previous = grouped.get(result.group);
    if (previous) previous.occurrences += 1;
    else grouped.set(result.group, { first: result, occurrences: 1 });
  }

  // One teaching example per category; mistakes first, with no filler.
  const moments = [...grouped.values()]
    .sort((a, b) => {
      const kindA = a.first.kind === "mistake" ? 0 : 1;
      const kindB = b.first.kind === "mistake" ? 0 : 1;
      return (
        kindA - kindB ||
        b.occurrences - a.occurrences ||
        a.first.moveNumber - b.first.moveNumber
      );
    })
    .slice(0, 5)
    .map(({ first, occurrences }): ReportMoment => {
      const { group: _group, ...moment } = first;
      void _group;
      return { ...moment, occurrences };
    });

  const lead = moments[0];
  const headline =
    verifiedMistakes > 0
      ? "Focus on the decisions we can prove"
      : provenGood > 0
        ? "Your verified decisions show strong moments"
        : "No definite coaching conclusion yet";
  const takeaway =
    lead?.kind === "mistake"
      ? `${lead.category} is a useful focus for your next game. ${lead.nextTime}`
      : lead?.kind === "good"
        ? `A proven strength in this game was ${lead.category.toLowerCase()}. ${lead.nextTime}`
        : "The available deductions did not establish a specific strong or mistaken move. An uncertain move is not automatically an avoidable guess.";

  return {
    headline,
    takeaway,
    recordedActions: game.moves.length,
    verifiedMistakes,
    provenGood,
    uncertainActions,
    moments,
    caveat:
      "Only facts derivable from the board visible before each move are used for coaching. No proof means insufficient evidence, not proof that a guess was unavoidable. Results are from this one Practice game, not a long-term player profile.",
  };
}

/** Accept an AI suggestion only when it exactly matches an existing verified moment. */
export function validateFocusSelection(
  report: EvidenceReport,
  id: unknown,
  style: unknown,
): { focusId: string; style: "direct" | "step-by-step" } | null {
  if (
    typeof id !== "string" ||
    !report.moments.some((moment) => moment.id === id) ||
    (style !== "direct" && style !== "step-by-step")
  )
    return null;
  return { focusId: id, style };
}
