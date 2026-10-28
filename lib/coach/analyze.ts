import {
  boardShapeOf,
  colOf,
  indexOf,
  neighboursOf,
  openingCellOf,
  rowOf,
} from "./board";
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
 * Boards can be rectangular (Expert is 16×30), so every index calculation uses
 * the real row and column counts.
 *
 * When `mines` is missing the engine still counts moves, flags and the opening
 * click, but it cannot judge decisions. It says so in `notes` instead of
 * pretending to know more than it does.
 */
export function analyzeGameplay(session: GameplaySession): CoachAnalysis {
  const shape = boardShapeOf(session);
  const rows = shape?.rows ?? 9;
  const columns = shape?.columns ?? 9;
  const total = rows * columns;
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
  if (!shape) {
    notes.push("The board dimensions were missing, so the coach assumed a 9 × 9 board.");
  }
  if (moves.length === 0) {
    notes.push("No moves were recorded for this game.");
  }

  const cells: Cell[] = Array.from({ length: total }, () => ({
    revealed: false,
    flagged: false,
  }));
  const number = new Array<number>(total).fill(-1);

  function neighbours(index: number): number[] {
    return neighboursOf(index, rows, columns);
  }

  function minesAround(index: number): number {
    let count = 0;
    for (const near of neighbours(index)) {
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
        for (const near of neighbours(current)) {
          if (!cells[near].revealed && !cells[near].flagged) stack.push(near);
        }
      }
    }
    return false;
  }

  // The single-point rules use the visible numbers and previously proven
  // mines/safe squares. A flag by itself is never evidence: the player may
  // have guessed correctly or incorrectly.
  //
  // On top of that, overlapping constraints are compared: when one number's
  // unknown squares are a subset of another's, the difference between their
  // mine counts decides the extra squares. That generalises patterns such as
  // 1–2–1 and 1–2–2–1, which single-point logic alone cannot solve.
  //
  // Flags stay inside the unknown set until the numbers independently prove
  // them. A wrong flag never turns an unproven square into a safe deduction.

  type Constraint = { cells: number[]; mines: number };

  function buildConstraints(
    knownMines: Set<number>,
    knownSafe: Set<number>,
  ): { constraints: Constraint[]; wrongFlagNumbers: number } {
    const constraints: Constraint[] = [];
    let wrongFlagNumbers = 0;
    for (let index = 0; index < total; index += 1) {
      if (!cells[index].revealed) continue;
      const value = number[index];
      if (value <= 0) continue;

      // Flags are player choices, not proven mines. A lucky flag cannot make
      // an otherwise uncertain neighbour logically safe.
      let hasWrongFlag = false;
      const hidden: number[] = [];
      for (const near of neighbours(index)) {
        if (!cells[near].revealed) {
          hidden.push(near);
          if (cells[near].flagged && !mineSet.has(near)) hasWrongFlag = true;
        }
      }
      if (hasWrongFlag) wrongFlagNumbers += 1;

      let known = 0;
      const candidates: number[] = [];
      for (const square of hidden) {
        if (knownMines.has(square)) known += 1;
        else if (!knownSafe.has(square)) candidates.push(square);
      }
      if (candidates.length === 0) continue;

      const remaining = value - known;
      if (remaining < 0 || remaining > candidates.length) continue;
      constraints.push({ cells: candidates, mines: remaining });
    }
    return { constraints, wrongFlagNumbers };
  }

  function deduce(): {
    safe: Set<number>;
    mines: Set<number>;
    advanced: boolean;
    wrongFlagNumbers: number;
  } {
    const safe = new Set<number>();
    const mines = new Set<number>();
    let advanced = false;
    let wrongFlagNumbers = 0;
    let rounds = 0;
    let changed = true;

    const addSafe = (square: number) => {
      if (!safe.has(square)) {
        safe.add(square);
        changed = true;
      }
    };
    const addMine = (square: number) => {
      if (!mines.has(square)) {
        mines.add(square);
        changed = true;
      }
    };

    while (changed && rounds < 8) {
      changed = false;
      rounds += 1;
      const built = buildConstraints(mines, safe);
      wrongFlagNumbers = Math.max(wrongFlagNumbers, built.wrongFlagNumbers);
      const constraints = built.constraints;

      for (const constraint of constraints) {
        if (constraint.mines === 0) {
          for (const square of constraint.cells) addSafe(square);
        } else if (constraint.mines === constraint.cells.length) {
          for (const square of constraint.cells) addMine(square);
        }
      }
      // Recompute before trying the more expensive comparison: single-point
      // facts usually collapse the frontier first.
      if (changed || constraints.length > 250) continue;

      outer: for (let i = 0; i < constraints.length; i += 1) {
        for (let j = 0; j < constraints.length; j += 1) {
          if (i === j) continue;
          const small = constraints[i];
          const big = constraints[j];
          if (small.cells.length >= big.cells.length) continue;
          const smallCells = new Set(small.cells);
          if (!small.cells.every((square) => big.cells.includes(square))) continue;

          const difference = big.cells.filter((square) => !smallCells.has(square));
          const remaining = big.mines - small.mines;
          if (remaining < 0 || remaining > difference.length) continue;
          if (remaining === 0) {
            for (const square of difference) addSafe(square);
          } else if (remaining === difference.length) {
            for (const square of difference) addMine(square);
          }
          if (changed) {
            advanced = true;
            break outer;
          }
        }
      }
    }

    return { safe, mines, advanced, wrongFlagNumbers };
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
  let usedAdvancedDeduction = false;
  let sawWrongFlagNumber = false;

  for (let position = 0; position < moves.length; position += 1) {
    // A completed loss ends the game. Ignore any corrupt trailing input.
    if (fatal) break;
    const move = moves[position];
    const moveNumber = position + 1;
    const row = Math.floor(move.row);
    const col = Math.floor(move.col);
    if (row < 0 || col < 0 || row >= rows || col >= columns) continue;
    const index = indexOf(row, col, columns);

    const deduction = hasMines
      ? deduce()
      : {
          safe: new Set<number>(),
          mines: new Set<number>(),
          advanced: false,
          wrongFlagNumbers: 0,
        };
    const { safe, mines } = deduction;
    if (deduction.advanced) usedAdvancedDeduction = true;
    if (deduction.wrongFlagNumbers > 0) sawWrongFlagNumber = true;

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
      // A chord only fires on a revealed number whose neighbouring flag count
      // equals its value. Anything else is ignored by the real board, so the
      // replay ignores it too instead of opening squares the player never saw.
      const target = cells[index];
      const value = number[index];
      if (!target.revealed || value <= 0) continue;
      const adjacent = neighbours(index);
      const adjacentFlags = adjacent.filter((near) => cells[near].flagged).length;
      if (adjacentFlags !== value) continue;

      const targets = adjacent.filter(
        (near) => !cells[near].revealed && !cells[near].flagged,
      );
      // The actual Ranked/Practice board rejects no-op chords.
      if (targets.length === 0) continue;
      counts.chords += 1;
      if (!hasMines) continue;
      const allProvablySafe = targets.every((square) => safe.has(square));
      if (!allProvablySafe) {
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
      // Chording is one atomic action. If any unopened neighbour is a mine,
      // the game is lost before the other neighbours are opened.
      const hitMine = targets.find((square) => mineSet.has(square));
      if (hitMine !== undefined) {
        fatal = {
          moveNumber,
          row: rowOf(hitMine, columns),
          col: colOf(hitMine, columns),
          avoidable: safe.size > 0,
          safeAvailable: safe.size,
        };
        continue;
      }
      for (const square of targets) {
        revealSquare(square);
      }
      continue;
    }

    // action === "reveal"
    counts.reveals += 1;
    if (!sawOpening) {
      sawOpening = true;
      opening = openingCellOf(row, col, rows, columns);
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

  // How much of the board the player actually cleared. Losses are scored by
  // progress: dying after nine squares is not the same game as dying with the
  // board almost solved.
  const totalSafe = total - mineSet.size;
  const revealedSafe = cells.reduce((count, cell) => count + (cell.revealed ? 1 : 0), 0);
  const progress = totalSafe > 0 ? Math.min(1, revealedSafe / totalSafe) : 0;

  const metrics: CoachMetrics | null = hasMines
    ? {
        totalMoves: moves.length,
        reveals: counts.reveals,
        flags: counts.flags,
        chords: counts.chords,
        logicalReveals: counts.logicalReveals,
        guesses: counts.guesses,
        avoidableGuesses: counts.avoidableGuesses,
        forcedGuesses: Math.max(0, counts.guesses - counts.avoidableGuesses),
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
            : null,
        openingCell: opening,
      }
    : null;

  // How much the coach could actually prove, stated in plain language. The
  // report shows these notes so a partial read is never mistaken for certainty.
  if (hasMines) {
    if (usedAdvancedDeduction) {
      notes.push(
        "Some squares were proven with overlapping number constraints (patterns such as 1–2–1), not just single numbers.",
      );
    }
    if (sawWrongFlagNumber) {
      notes.push(
        "Flags were treated as unproven guesses; deductions used only the visible numbers.",
      );
    }
    if (metrics && metrics.forcedGuesses > 0) {
      notes.push(
        `${metrics.forcedGuesses} guess${metrics.forcedGuesses > 1 ? "es were" : " was"} forced — the numbers left no provably safe square at that point.`,
      );
    }
    if (metrics && metrics.avoidableGuesses > 0) {
      notes.push(
        `${metrics.avoidableGuesses} guess${metrics.avoidableGuesses > 1 ? "es could" : " could"} have been avoided because a provably safe square was still available.`,
      );
    }
    if (session.outcome === "loss" && totalSafe > 0) {
      notes.push(
        `You cleared ${revealedSafe} of ${totalSafe} safe squares (${Math.round(progress * 100)}%) before the game ended.`,
      );
    }
  }

  // Scores start at 100 and lose points for avoidable mistakes. A win is judged
  // by how clean it was; a loss is judged mainly by how far the player got,
  // because dying after a handful of squares is not the same performance as
  // dying with most of the board solved.
  let score: number;
  if (!hasMines) {
    score = session.outcome === "win" ? 80 : session.outcome === "loss" ? 55 : 65;
  } else if (session.outcome === "loss") {
    // 35 at an empty board, up to 90 with almost every safe square cleared.
    score = 35 + Math.round(progress * 55);
    if (fatal && fatal.avoidable) score -= 12;
    const avoidable = counts.avoidableGuesses - (fatal && fatal.avoidable ? 1 : 0);
    score -= Math.min(18, Math.max(0, avoidable) * 3);
    score -= Math.min(16, counts.wrongFlags * 4);
    if (counts.revealsOnKnownMine > 0) score -= 6;
    score = Math.max(0, Math.min(100, Math.round(score)));
  } else {
    score = 100;
    if (session.outcome === "win") score += 6;
    score -= Math.min(24, Math.max(0, counts.avoidableGuesses) * 3);
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
    const cleared = Math.round(progress * 100);
    summary = `You cleared ${cleared}% of the safe squares before move ${fatal.moveNumber} hit a mine, even though ${fatal.safeAvailable} provably safe square${fatal.safeAvailable > 1 ? "s were" : " was"} still available.`;
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
    notes: analysis.notes,
  };
}
