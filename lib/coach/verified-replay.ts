import type { GameplayMove } from "./types";

// Deterministic, read-only analysis of a Minesweeper recording.
// Critical rule: only visible numbers, board dimensions, and total mine count
// may be used to PROVE a move. The true mine layout is used only to replay
// what happened after the player acted, never to judge their earlier knowledge.

export type VisibleCell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  exploded: boolean;
};

export type Proof = {
  index: number;
  reason: string;
  supportingCells: number[];
};

export type Deductions = {
  safe: Proof[];
  mines: Proof[];
};

export type Decision = "good" | "mistake" | "not-enough-evidence";
export type MistakeType =
  | "unnecessary-guess"
  | "revealed-known-mine"
  | "flagged-known-safe"
  | null;

export type ReplayFrame = {
  actionNumber: number;
  move: GameplayMove;
  before: VisibleCell[];
  after: VisibleCell[];
  deductions: Deductions;
  decision: Decision;
  mistakeType: MistakeType;
  explanation: string;
  changed: boolean;
  status: "playing" | "won" | "lost";
};

export type RecordedGame = {
  rows: number;
  columns: number;
  mineCount: number;
  mines: number[];
  moves: GameplayMove[];
};

export type ReplayResult = {
  rows: number;
  columns: number;
  frames: ReplayFrame[];
  status: "playing" | "won" | "lost";
  finalBoard: VisibleCell[];
};

type Constraint = { cells: number[]; count: number; source: number[] };

function around(index: number, rows: number, columns: number): number[] {
  const row = Math.floor(index / columns);
  const col = index % columns;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < columns) {
        result.push(r * columns + c);
      }
    }
  }
  return result;
}

function label(index: number, columns: number): string {
  return `row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}`;
}

function snapshot(cells: VisibleCell[]): VisibleCell[] {
  return cells.map((cell) => ({ ...cell }));
}

/**
 * Derive *only* guaranteed cells using the numbers the player can see.
 * Flags are NOT accepted as proof of mines; they remain covered unknowns until
 * the visible board independently proves them. Subset and total-mine rules are
 * applied until no new logical deductions can be made.
 *
 * Not finding a proof does NOT establish that the move was unavoidable.
 */
export function deduceVisibleBoard(
  rows: number,
  columns: number,
  mineCount: number,
  cells: readonly VisibleCell[],
): Deductions {
  const total = rows * columns;
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 2 ||
    columns < 2 ||
    !Number.isInteger(mineCount) ||
    mineCount < 0 ||
    mineCount >= total ||
    cells.length !== total
  ) {
    throw new Error("Invalid visible board dimensions or mine count.");
  }

  const safe = new Map<number, Proof>();
  const mines = new Map<number, Proof>();

  function add(
    target: Map<number, Proof>,
    index: number,
    reason: string,
    source: number[],
  ): boolean {
    if (safe.has(index) || mines.has(index) || cells[index].revealed) return false;
    target.set(index, { index, reason, supportingCells: [...source] });
    return true;
  }

  for (let pass = 0; pass < total * 2 + 2; pass += 1) {
    let changed = false;
    const constraints: Constraint[] = [];

    // A revealed number constrains the actual mines in its still-covered neighbours.
    // A player's flag is treated as an unverified mark, not a known mine.
    for (let index = 0; index < total; index += 1) {
      const cell = cells[index];
      if (!cell.revealed || cell.adjacentMines === null || cell.exploded) continue;
      const neighbours = around(index, rows, columns);
      const confirmedMines = neighbours.filter((near) => mines.has(near)).length;
      const unknown = neighbours.filter(
        (near) => !cells[near].revealed && !safe.has(near) && !mines.has(near),
      );
      const remaining = cell.adjacentMines - confirmedMines;
      if (remaining < 0 || remaining > unknown.length) {
        // An impossible state must not generate further proofs.
        return { safe: [], mines: [] };
      }
      if (unknown.length > 0) {
        constraints.push({ cells: unknown, count: remaining, source: [index] });
      }
    }

    // The global mine count is public knowledge. It does not validate flags.
    const unknownGlobally: number[] = [];
    for (let index = 0; index < total; index += 1) {
      if (!cells[index].revealed && !safe.has(index) && !mines.has(index)) {
        unknownGlobally.push(index);
      }
    }
    const minesRemaining = mineCount - mines.size;
    if (minesRemaining < 0 || minesRemaining > unknownGlobally.length) {
      return { safe: [], mines: [] };
    }
    if (unknownGlobally.length > 0) {
      constraints.push({ cells: unknownGlobally, count: minesRemaining, source: [] });
    }

    // If a constraint has no remaining mines, all of its unknown cells are safe.
    // If every remaining cell is a mine, all of those cells are confirmed mines.
    for (const constraint of constraints) {
      if (constraint.count !== 0 && constraint.count !== constraint.cells.length)
        continue;
      const target = constraint.count === 0 ? safe : mines;
      const kind = constraint.count === 0 ? "safe" : "a mine";
      const reason =
        constraint.source.length === 0
          ? `Total mine count proves this cell is ${kind}.`
          : `Visible number at ${label(constraint.source[0], columns)} proves this cell is ${kind}.`;
      for (const index of constraint.cells) {
        changed = add(target, index, reason, constraint.source) || changed;
      }
    }
    if (changed) continue; // Simplify constraints with fresh proofs first.

    // Subset deduction: if A's unknowns are a subset of B's, subtract their
    // mine totals to prove the cells in B minus A.
    for (const a of constraints) {
      const setA = new Set(a.cells);
      for (const b of constraints) {
        if (a === b || a.cells.length >= b.cells.length) continue;
        if (!a.cells.every((index) => b.cells.includes(index))) continue;
        const difference = b.cells.filter((index) => !setA.has(index));
        const remaining = b.count - a.count;
        if (remaining !== 0 && remaining !== difference.length) continue;
        const target = remaining === 0 ? safe : mines;
        const kind = remaining === 0 ? "safe" : "a mine";
        const evidence = [...new Set([...a.source, ...b.source])];
        const reason = `Comparing visible number constraints proves this cell is ${kind}.`;
        for (const index of difference) {
          changed = add(target, index, reason, evidence) || changed;
        }
      }
    }

    if (!changed) break;
  }

  return { safe: [...safe.values()], mines: [...mines.values()] };
}

/** Recreate the exact visible board after every recorded player action. */
export function replayRecordedGame(game: RecordedGame): ReplayResult {
  const { rows, columns, mineCount, moves } = game;
  const total = rows * columns;
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 2 ||
    columns < 2 ||
    rows > 50 ||
    columns > 50 ||
    !Number.isInteger(mineCount) ||
    mineCount < 0 ||
    mineCount >= total ||
    !Array.isArray(game.mines) ||
    game.mines.length !== mineCount ||
    !game.mines.every(
      (index) => Number.isInteger(index) && index >= 0 && index < total,
    ) ||
    new Set(game.mines).size !== mineCount ||
    !Array.isArray(moves) ||
    moves.length > 10000
  ) {
    throw new Error("Invalid recorded Minesweeper game.");
  }

  const hiddenMines = new Set(game.mines);
  const adjacentCounts = Array.from(
    { length: total },
    (_, index) =>
      around(index, rows, columns).filter((near) => hiddenMines.has(near)).length,
  );
  const cells: VisibleCell[] = Array.from({ length: total }, () => ({
    revealed: false,
    flagged: false,
    adjacentMines: null,
    exploded: false,
  }));
  const frames: ReplayFrame[] = [];
  let status: ReplayResult["status"] = "playing";

  function reveal(index: number): boolean {
    if (cells[index].revealed || cells[index].flagged) return false;
    if (hiddenMines.has(index)) {
      // The live Practice board shows every mine on loss, but not before.
      for (const mine of hiddenMines) {
        cells[mine].revealed = true;
        cells[mine].adjacentMines = null;
      }
      cells[index].exploded = true;
      status = "lost";
      return true;
    }
    const pending = [index];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (cells[current].revealed || cells[current].flagged) continue;
      cells[current].revealed = true;
      cells[current].adjacentMines = adjacentCounts[current];
      if (adjacentCounts[current] === 0) {
        for (const neighbour of around(current, rows, columns)) {
          if (!cells[neighbour].revealed && !cells[neighbour].flagged) {
            pending.push(neighbour);
          }
        }
      }
    }
    return true;
  }

  for (let n = 0; n < moves.length && status === "playing"; n += 1) {
    const move = moves[n];
    if (
      !move ||
      !Number.isInteger(move.row) ||
      !Number.isInteger(move.col) ||
      move.row < 0 ||
      move.row >= rows ||
      move.col < 0 ||
      move.col >= columns ||
      !["reveal", "flag", "unflag", "chord"].includes(move.action)
    ) {
      throw new Error(`Invalid action at move ${n + 1}.`);
    }

    const index = move.row * columns + move.col;
    const before = snapshot(cells);
    const deductions = deduceVisibleBoard(rows, columns, mineCount, before);
    const safe = new Map(deductions.safe.map((proof) => [proof.index, proof]));
    const mines = new Map(deductions.mines.map((proof) => [proof.index, proof]));
    let decision: Decision = "not-enough-evidence";
    let mistakeType: MistakeType = null;
    let explanation = "No conclusion can be proven from the visible information alone.";
    let changed = false;
    const target = cells[index];

    if (move.action === "flag" && !target.revealed && !target.flagged) {
      const count = cells.filter((cell) => cell.flagged).length;
      if (count < mineCount) {
        if (safe.has(index)) {
          decision = "mistake";
          mistakeType = "flagged-known-safe";
          explanation = `The visible numbers already proved ${label(index, columns)} was safe.`;
        } else if (mines.has(index)) {
          decision = "good";
          explanation = `The visible numbers proved ${label(index, columns)} contained a mine.`;
        }
        target.flagged = true;
        changed = true;
      }
    } else if (move.action === "unflag" && target.flagged && !target.revealed) {
      target.flagged = false;
      changed = true;
    } else if (move.action === "reveal" && !target.revealed && !target.flagged) {
      if (mines.has(index)) {
        decision = "mistake";
        mistakeType = "revealed-known-mine";
        explanation = `The visible numbers already proved ${label(index, columns)} contained a mine.`;
      } else if (safe.has(index)) {
        decision = "good";
        explanation = `The visible numbers already proved ${label(index, columns)} was safe.`;
      } else if (
        safe.size > 0 &&
        frames.some((frame) => frame.move.action === "reveal")
      ) {
        decision = "mistake";
        mistakeType = "unnecessary-guess";
        explanation = `This square was uncertain while ${safe.size} other square(s) were provably safe.`;
      }
      changed = reveal(index);
    } else if (
      move.action === "chord" &&
      target.revealed &&
      target.adjacentMines !== null &&
      target.adjacentMines > 0
    ) {
      const neighbours = around(index, rows, columns);
      const flags = neighbours.filter((near) => cells[near].flagged).length;
      const targets = neighbours.filter(
        (near) => !cells[near].revealed && !cells[near].flagged,
      );
      if (flags === target.adjacentMines && targets.length > 0) {
        if (targets.some((near) => mines.has(near))) {
          decision = "mistake";
          mistakeType = "revealed-known-mine";
          explanation =
            "This chord included a square the visible numbers had proven was a mine.";
        } else if (targets.every((near) => safe.has(near))) {
          decision = "good";
          explanation = "Every square opened by this chord was provably safe.";
        } else if (safe.size > 0) {
          decision = "mistake";
          mistakeType = "unnecessary-guess";
          explanation =
            "This chord included uncertain squares while proven-safe moves were available.";
        }
        for (const neighbour of targets) {
          changed = reveal(neighbour) || changed;
          if (cells.some((cell) => cell.exploded)) break;
        }
      }
    }

    if (!cells.some((cell) => cell.exploded)) {
      const revealedSafe = cells.filter(
        (cell, i) => cell.revealed && !hiddenMines.has(i),
      ).length;
      if (revealedSafe === total - mineCount) status = "won";
    }

    frames.push({
      actionNumber: n + 1,
      move: { ...move },
      before,
      after: snapshot(cells),
      deductions,
      decision,
      mistakeType,
      explanation,
      changed,
      status,
    });
  }

  return { rows, columns, frames, status, finalBoard: snapshot(cells) };
}
