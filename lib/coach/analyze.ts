import type {
  CoachAnalysis,
  CoachGrade,
  CoachKeyMoment,
  CoachMetrics,
  CoachReport,
  GameplaySession,
  OpeningCell,
} from "./types";

// The deterministic half of the coach.
//
// It replays the recorded game, decides whether each click followed the
// information on the board, and writes the score, metrics and bullet points.
// The AI providers (when configured) only rewrite the story in friendlier
// words; they never invent the numbers below. That split keeps the feedback
// honest and lets the feature work with no API key at all.

function positionLabel(row: number, col: number): string {
  // People count from 1; the data counts from 0.
  return `row ${row + 1}, column ${col + 1}`;
}

/** Indices of the up-to-eight squares around `index` on a square board. */
function neighbours(index: number, size: number): number[] {
  const row = Math.floor(index / size);
  const col = index % size;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      out.push(r * size + c);
    }
  }
  return out;
}

function classifyOpening(row: number, col: number, size: number): OpeningCell {
  const onVerticalEdge = row === 0 || row === size - 1;
  const onHorizontalEdge = col === 0 || col === size - 1;
  if (onVerticalEdge && onHorizontalEdge) return "corner";
  if (onVerticalEdge || onHorizontalEdge) return "edge";
  return "center";
}

function gradeFor(score: number): CoachGrade {
  if (score >= 90) return "S";
  if (score >= 78) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

type Cell = { revealed: boolean; flagged: boolean };

type FatalMove = {
  moveNumber: number;
  row: number;
  col: number;
  /** True when a provably safe square was still available at the time. */
  avoidable: boolean;
  safeAvailable: number;
};

type GuessRecord = {
  moveNumber: number;
  row: number;
  col: number;
  safeAvailable: number;
};

/**
 * Replays one game and produces the deterministic coaching analysis.
 *
 * When `mines` is missing the engine still counts moves, flags and the opening
 * click, but it cannot judge decisions. It says so in `notes` instead of
 * pretending to know more than it does.
 */
export function analyzeGameplay(session: GameplaySession): CoachAnalysis {
  const size = Math.max(2, Math.floor(session.boardSize));
  const total = size * size;
  const moves = session.moves ?? [];
  const hasMines = Array.isArray(session.mines) && session.mines.length > 0;
  const mineSet = new Set(
    (session.mines ?? []).filter((index) => index >= 0 && index < total),
  );

  const notes: string[] = [
    hasMines
      ? "The coach replayed the board from the recorded mine layout."
      : "No mine layout was sent, so the coach could not replay individual decisions.",
  ];
  if (moves.length === 0) {
    notes.push("No moves were recorded for this game.");
  }

  const cells: Cell[] = Array.from({ length: total }, () => ({
    revealed: false,
    flagged: false,
  }));
  const number = new Array<number>(total).fill(-1);

  function minesAround(index: number): number {
    let count = 0;
    for (const near of neighbours(index, size)) {
      if (mineSet.has(near)) count += 1;
    }
    return count;
  }

  // Reveal a square. A blank (0) square opens its neighbours too, exactly like
  // a real board. Returns true when a mine was hit.
  function revealSquare(index: number): boolean {
    if (cells[index].revealed || cells[index].flagged) return false;
    if (mineSet.has(index)) return true;
    const stack = [index];
    while (stack.length > 0) {
      const current = stack.pop() as number;
      if (cells[current].revealed || cells[current].flagged) continue;
      if (mineSet.has(current)) return true;
      cells[current].revealed = true;
      const count = minesAround(current);
      number[current] = count;
      if (count === 0) {
        for (const near of neighbours(current, size)) {
          if (!cells[near].revealed && !cells[near].flagged) stack.push(near);
        }
      }
    }
    return false;
  }

  // The single-point rule every Minesweeper coach teaches: a number with as
  // many flags around it as its value proves its other covered neighbours are
  // safe; a number with no flags left to place proves they are mines.
  function deduce(): { safe: Set<number>; mines: Set<number> } {
    const safe = new Set<number>();
    const mines = new Set<number>();
    for (let index = 0; index < total; index += 1) {
      if (!cells[index].revealed) continue;
      const value = number[index];
      if (value <= 0) continue;
      const hidden: number[] = [];
      let flags = 0;
      for (const near of neighbours(index, size)) {
        if (cells[near].flagged) flags += 1;
        else if (!cells[near].revealed) hidden.push(near);
      }
      if (hidden.length === 0) continue;
      const remaining = value - flags;
      if (remaining === hidden.length) {
        for (const square of hidden) mines.add(square);
      } else if (remaining === 0) {
        for (const square of hidden) safe.add(square);
      }
    }
    return { safe, mines };
  }

  const counts = {
    reveals: 0,
    flags: 0,
    chords: 0,
    logicalReveals: 0,
    guesses: 0,
    avoidableGuesses: 0,
    correctFlags: 0,
    wrongFlags: 0,
    revealsOnKnownMine: 0,
  };

  let opening: OpeningCell = "unknown";
  let sawOpening = false;
  let fatal: FatalMove | null = null;
  let firstAvoidableGuess: GuessRecord | null = null;
  let firstLogicMove: GuessRecord | null = null;

  for (let position = 0; position < moves.length; position += 1) {
    const move = moves[position];
    const moveNumber = position + 1;
    const row = Math.floor(move.row);
    const col = Math.floor(move.col);
    const index = row * size + col;
    if (row < 0 || col < 0 || index < 0 || index >= total) continue;

    const { safe, mines } = hasMines
      ? deduce()
      : { safe: new Set<number>(), mines: new Set<number>() };

    if (move.action === "flag") {
      counts.flags += 1;
      if (hasMines) {
        if (mineSet.has(index)) counts.correctFlags += 1;
        else counts.wrongFlags += 1;
      }
      cells[index].flagged = true;
      continue;
    }

    if (move.action === "unflag") {
      // The tallies count flag placements, not the current flag count, so a
      // corrected flag still counts as one mistake and stays in the history.
      cells[index].flagged = false;
      continue;
    }

    if (move.action === "chord") {
      counts.chords += 1;
      if (!hasMines) continue;
      const targets = neighbours(index, size).filter(
        (near) => !cells[near].revealed && !cells[near].flagged,
      );
      const risky = targets.some((target) => mineSet.has(target));
      if (risky) {
        counts.guesses += 1;
        if (safe.size > 0) {
          counts.avoidableGuesses += 1;
          if (!firstAvoidableGuess) {
            firstAvoidableGuess = { moveNumber, row, col, safeAvailable: safe.size };
          }
        }
      } else {
        counts.logicalReveals += 1;
      }
      for (const target of targets) {
        const hit = revealSquare(target);
        if (hit && !fatal) {
          fatal = {
            moveNumber,
            row: Math.floor(target / size),
            col: target % size,
            avoidable: safe.size > 0,
            safeAvailable: safe.size,
          };
        }
      }
      continue;
    }

    // action === "reveal"
    counts.reveals += 1;
    if (!sawOpening) {
      sawOpening = true;
      opening = classifyOpening(row, col, size);
    }

    if (hasMines) {
      if (mines.has(index)) counts.revealsOnKnownMine += 1;
      if (safe.has(index)) {
        counts.logicalReveals += 1;
        if (!firstLogicMove) {
          firstLogicMove = { moveNumber, row, col, safeAvailable: safe.size };
        }
      } else {
        counts.guesses += 1;
        if (safe.size > 0) {
          counts.avoidableGuesses += 1;
          if (!firstAvoidableGuess) {
            firstAvoidableGuess = { moveNumber, row, col, safeAvailable: safe.size };
          }
        }
      }
      const hit = revealSquare(index);
      if (hit && !fatal) {
        fatal = {
          moveNumber,
          row,
          col,
          avoidable: safe.size > 0,
          safeAvailable: safe.size,
        };
      }
    } else {
      cells[index].revealed = true;
    }
  }

  const metrics: CoachMetrics | null = hasMines
    ? {
        totalMoves: moves.length,
        reveals: counts.reveals,
        flags: counts.flags,
        chords: counts.chords,
        logicalReveals: counts.logicalReveals,
        guesses: counts.guesses,
        avoidableGuesses: counts.avoidableGuesses,
        guessRate:
          counts.reveals > 0
            ? Math.round((counts.guesses / counts.reveals) * 100) / 100
            : 0,
        correctFlags: counts.correctFlags,
        wrongFlags: counts.wrongFlags,
        flagAccuracy:
          counts.correctFlags + counts.wrongFlags > 0
            ? Math.round(
                (counts.correctFlags / (counts.correctFlags + counts.wrongFlags)) * 100,
              ) / 100
            : 1,
        openingCell: opening,
      }
    : null;

  // Scores start at 100 and lose points for avoidable mistakes. A loss is not a
  // disaster by itself; a loss the board warned you about costs the most.
  let score: number;
  if (!hasMines) {
    score = session.outcome === "win" ? 80 : session.outcome === "loss" ? 55 : 65;
  } else {
    score = 100;
    if (session.outcome === "loss") {
      score -= 18;
      if (fatal && fatal.avoidable) score -= 22;
    } else if (session.outcome === "win") {
      score += 6;
    }
    const avoidable = counts.avoidableGuesses - (fatal && fatal.avoidable ? 1 : 0);
    score -= Math.min(24, Math.max(0, avoidable) * 3);
    score -= Math.min(16, counts.wrongFlags * 4);
    if (counts.revealsOnKnownMine > 0) score -= 6;
    score = Math.max(0, Math.min(100, Math.round(score)));
  }
  const grade = gradeFor(score);

  // ---- Narrative the rule coach writes on its own -------------------------
  const strengths: string[] = [];
  const improvements: string[] = [];
  const nextSteps: string[] = [];

  if (hasMines) {
    if (counts.logicalReveals > 0 && counts.reveals > 0) {
      const percent = Math.round((counts.logicalReveals / counts.reveals) * 100);
      strengths.push(
        `You played ${counts.logicalReveals} of ${counts.reveals} reveals on squares the numbers already proved safe (${percent}%).`,
      );
    }
    if (counts.correctFlags > 0 && counts.wrongFlags === 0) {
      strengths.push(
        `Every flag was correct — all ${counts.correctFlags} sat on real mines.`,
      );
    }
    if (counts.chords > 0) {
      strengths.push(
        `You chorded ${counts.chords} time${counts.chords > 1 ? "s" : ""}, clearing several squares in one action.`,
      );
    }
    if (counts.avoidableGuesses === 0 && counts.reveals > 0) {
      strengths.push(
        "You never gambled while a guaranteed safe square was still on the board.",
      );
    }
    if (session.outcome === "win") {
      strengths.push("You cleared the whole board.");
    }
    if (opening === "corner") {
      strengths.push(
        "You opened on a corner, a strong first click that keeps the numbers simple.",
      );
    }

    if (fatal && fatal.avoidable) {
      improvements.push(
        `The game ended on move ${fatal.moveNumber} at ${positionLabel(fatal.row, fatal.col)}: you clicked there while ${fatal.safeAvailable} provably safe square${fatal.safeAvailable > 1 ? "s were" : " was"} available.`,
      );
    }
    if (firstAvoidableGuess) {
      improvements.push(
        `On move ${firstAvoidableGuess.moveNumber} at ${positionLabel(firstAvoidableGuess.row, firstAvoidableGuess.col)} you guessed while ${firstAvoidableGuess.safeAvailable} safe square${firstAvoidableGuess.safeAvailable > 1 ? "s were" : " was"} still visible.`,
      );
    }
    if (counts.wrongFlags > 0) {
      improvements.push(
        `${counts.wrongFlags} flag${counts.wrongFlags > 1 ? "s" : ""} went on safe squares — a wrong flag makes every number next to it lie to you.`,
      );
    }
    if (counts.revealsOnKnownMine > 0) {
      improvements.push(
        "At least one click landed on a square the numbers had already marked as a mine.",
      );
    }
    if (counts.chords === 0 && counts.reveals > 4) {
      improvements.push("You never chorded, so you opened completed squares one by one.");
    }
    if (metrics && metrics.guessRate > 0.5 && counts.guesses > 3) {
      improvements.push(
        `More than half of your reveals were guesses (${counts.guesses} of ${counts.reveals}).`,
      );
    }

    if (firstAvoidableGuess || (fatal && fatal.avoidable)) {
      nextSteps.push(
        "Before any guess, scan every visible number for one whose mines are already all flagged — its other covered neighbours are safe.",
      );
    }
    if (counts.wrongFlags > 0) {
      nextSteps.push(
        "Count the flags around a number before placing another; a number two means exactly two mines touch it.",
      );
    }
    if (counts.chords === 0) {
      nextSteps.push(
        "Once a number has all its flags, click the number itself to clear the rest of its squares at once.",
      );
    }
    if (nextSteps.length === 0) {
      nextSteps.push("Keep practising the 1–2–1 and 1–2–2–1 patterns along the edges.");
    }
  } else {
    nextSteps.push(
      "Send the mine layout with the game so the coach can replay each decision.",
    );
  }

  if (strengths.length === 0) {
    strengths.push(
      "You finished the game and recorded it — that is what makes coaching possible.",
    );
  }
  if (improvements.length === 0) {
    improvements.push(
      "No obvious mistakes in this game; the decisions matched the numbers you could see.",
    );
  }

  const keyMoment: CoachKeyMoment | null = fatal
    ? {
        moveNumber: fatal.moveNumber,
        row: fatal.row,
        col: fatal.col,
        description: fatal.avoidable
          ? `This click hit a mine while ${fatal.safeAvailable} provably safe square${fatal.safeAvailable > 1 ? "s were" : " was"} still on the board.`
          : "No provably safe move was left, so this was a genuine coin flip that went wrong.",
      }
    : firstAvoidableGuess
      ? {
          moveNumber: firstAvoidableGuess.moveNumber,
          row: firstAvoidableGuess.row,
          col: firstAvoidableGuess.col,
          description: `You guessed here while ${firstAvoidableGuess.safeAvailable} safe square${firstAvoidableGuess.safeAvailable > 1 ? "s were" : " was"} available.`,
        }
      : firstLogicMove
        ? {
            moveNumber: firstLogicMove.moveNumber,
            row: firstLogicMove.row,
            col: firstLogicMove.col,
            description:
              "You revealed this square by reading the numbers around it — exactly the habit to keep.",
          }
        : null;

  let headline: string;
  if (!hasMines) {
    headline =
      session.outcome === "win"
        ? "A win — send the mines for a deeper read."
        : "Send the mine layout for a deeper read.";
  } else if (session.outcome === "win" && score >= 85) {
    headline = "A clean, logical win.";
  } else if (session.outcome === "win") {
    headline = "You won — with a few risky clicks.";
  } else if (fatal && fatal.avoidable) {
    headline = "One avoidable click decided this game.";
  } else if (fatal) {
    headline = "A tough finish — the last guess was unavoidable.";
  } else if (session.outcome === "in-progress") {
    headline = "A good start to build on.";
  } else {
    headline = "Here is what the board showed.";
  }

  let summary: string;
  if (!hasMines) {
    summary = `The game lasted ${moves.length} recorded moves${session.durationSeconds ? ` in ${session.durationSeconds} seconds` : ""}. Add the mine layout to unlock decision-by-decision feedback.`;
  } else if (fatal && fatal.avoidable) {
    summary = `You were solving the board well, but move ${fatal.moveNumber} ignored ${fatal.safeAvailable} safe square${fatal.safeAvailable > 1 ? "s" : ""} and hit a mine. The rest of the read was sound.`;
  } else if (fatal) {
    summary = `You ran out of certain moves and the final guess cost you the game. That ending was out of your hands.`;
  } else if (session.outcome === "win") {
    summary = `You cleared the board with ${counts.logicalReveals} logically certain reveals and ${counts.guesses} guess${counts.guesses === 1 ? "" : "es"}.`;
  } else {
    summary = `A ${moves.length}-move game with ${counts.logicalReveals} certain reveals and ${counts.guesses} guess${counts.guesses === 1 ? "" : "es"}.`;
  }

  return {
    metrics,
    grade,
    score,
    headline,
    summary,
    strengths,
    improvements,
    keyMoment,
    nextSteps,
    notes,
  };
}

/**
 * Wrap a rule-engine analysis as a renderable report. Used by the API when no
 * provider is configured, and by the Coaching page when the API cannot be
 * reached (for example on a static host).
 */
export function toRuleReport(analysis: CoachAnalysis): CoachReport {
  return {
    headline: analysis.headline,
    grade: analysis.grade,
    score: analysis.score,
    summary: analysis.summary,
    strengths: analysis.strengths,
    improvements: analysis.improvements,
    keyMoment: analysis.keyMoment,
    nextSteps: analysis.nextSteps,
    metrics: analysis.metrics,
    source: "rules",
    model: null,
  };
}
