import { boardShapeOf, MAX_BOARD_DIMENSION, MIN_BOARD_DIMENSION } from "./board";
import { parseCoachPreferences } from "./preferences";
import type { GameplayMove, GameplaySession, MoveAction } from "./types";

// Server-side validation for POST /api/coach.
//
// The goal is a clear 400 with a helpful message rather than a confusing crash
// deep inside the analyser — and never a report built on data the player could
// not have produced. Every field that decides a coaching conclusion is checked:
// board dimensions, the mine layout against the declared count, and the move
// history.

export const MAX_MOVES = 5000;
export const MAX_DURATION_SECONDS = 86_400;
export const MAX_TEXT_FIELD = 40;

const ACTIONS: readonly MoveAction[] = ["reveal", "flag", "unflag", "chord"];
const OUTCOMES = ["win", "loss", "in-progress"] as const;

export type ValidationResult = { session: GameplaySession } | { error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

function readLabel(
  value: unknown,
  field: string,
): { value?: string } | { error: string } {
  if (value === undefined) return {};
  if (typeof value !== "string") return { error: `${field} must be a string.` };
  if (value.length > MAX_TEXT_FIELD) {
    return { error: `${field} must be ${MAX_TEXT_FIELD} characters or fewer.` };
  }
  return { value };
}

export function validateSession(body: unknown): ValidationResult {
  if (!isObject(body)) {
    return { error: "Send a JSON object describing one game." };
  }

  // ---- board dimensions ---------------------------------------------------
  const legacySize = body.boardSize === undefined ? null : asInt(body.boardSize);
  const hasRectangularFields = body.rows !== undefined || body.columns !== undefined;
  let rows: number;
  let columns: number;

  if (hasRectangularFields) {
    const parsedRows = asInt(body.rows);
    const parsedColumns = asInt(body.columns);
    if (parsedRows === null || parsedColumns === null) {
      return { error: "rows and columns must both be whole numbers." };
    }
    if (body.boardSize !== undefined && legacySize === null) {
      return { error: "boardSize must be a whole number when provided." };
    }
    if (
      legacySize !== null &&
      (legacySize !== parsedRows || legacySize !== parsedColumns)
    ) {
      return {
        error:
          "boardSize only describes square boards; for rectangular boards send rows and columns without boardSize.",
      };
    }
    rows = parsedRows;
    columns = parsedColumns;
  } else {
    if (legacySize === null) {
      return { error: "Send rows and columns (or boardSize for a square board)." };
    }
    rows = legacySize;
    columns = legacySize;
  }

  const shape = boardShapeOf({ rows, columns });
  if (!shape) {
    return {
      error: `rows and columns must be whole numbers between ${MIN_BOARD_DIMENSION} and ${MAX_BOARD_DIMENSION}.`,
    };
  }
  const total = shape.rows * shape.columns;

  // ---- mines --------------------------------------------------------------
  const mineCount = asInt(body.mineCount);
  if (mineCount === null || mineCount < 0 || mineCount >= total) {
    return {
      error: `mineCount must be a whole number between 0 and ${total - 1}.`,
    };
  }

  let mines: number[] | undefined;
  if (body.mines !== undefined) {
    if (!Array.isArray(body.mines)) {
      return { error: "mines must be an array of row-major square indices." };
    }
    if (body.mines.length !== mineCount) {
      return {
        error: `mines must contain exactly mineCount (${mineCount}) squares; received ${body.mines.length}.`,
      };
    }
    const seen = new Set<number>();
    mines = [];
    for (const entry of body.mines) {
      const index = asInt(entry);
      if (index === null || index < 0 || index >= total) {
        return { error: `Every mine index must be between 0 and ${total - 1}.` };
      }
      if (seen.has(index)) {
        return { error: `Mine index ${index} appears more than once.` };
      }
      seen.add(index);
      mines.push(index);
    }
  }

  // ---- moves --------------------------------------------------------------
  if (!Array.isArray(body.moves)) {
    return { error: "moves must be an array of { row, col, action } objects." };
  }
  if (body.moves.length > MAX_MOVES) {
    return { error: `A game may record at most ${MAX_MOVES} moves.` };
  }

  const moves: GameplayMove[] = [];
  let previousAtMs = -1;
  for (let i = 0; i < body.moves.length; i += 1) {
    const raw = body.moves[i];
    if (!isObject(raw)) return { error: `Move ${i + 1} is not an object.` };
    const row = asInt(raw.row);
    const col = asInt(raw.col);
    const action = typeof raw.action === "string" ? raw.action : "";
    if (
      row === null ||
      col === null ||
      row < 0 ||
      col < 0 ||
      row >= shape.rows ||
      col >= shape.columns
    ) {
      return {
        error: `Move ${i + 1} has a row or column outside the ${shape.rows} × ${shape.columns} board.`,
      };
    }
    if (!ACTIONS.includes(action as MoveAction)) {
      return { error: `Move ${i + 1} must use one of: ${ACTIONS.join(", ")}.` };
    }

    let atMs: number | undefined;
    if (raw.atMs !== undefined) {
      const parsedAtMs = asInt(raw.atMs);
      if (parsedAtMs === null || parsedAtMs < 0) {
        return { error: `Move ${i + 1} has an invalid atMs timestamp.` };
      }
      if (parsedAtMs < previousAtMs) {
        return {
          error: `Move ${i + 1} has a timestamp earlier than the move before it.`,
        };
      }
      previousAtMs = parsedAtMs;
      atMs = parsedAtMs;
    }

    moves.push({
      row,
      col,
      action: action as MoveAction,
      ...(atMs !== undefined ? { atMs } : {}),
    });
  }

  // ---- outcome, duration, labels -----------------------------------------
  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  if (!(OUTCOMES as readonly string[]).includes(outcome)) {
    return { error: 'outcome must be "win", "loss" or "in-progress".' };
  }

  let durationSeconds: number | undefined;
  if (body.durationSeconds !== undefined) {
    const parsedDuration = asInt(body.durationSeconds);
    if (
      parsedDuration === null ||
      parsedDuration < 0 ||
      parsedDuration > MAX_DURATION_SECONDS
    ) {
      return {
        error: `durationSeconds must be a whole number between 0 and ${MAX_DURATION_SECONDS}.`,
      };
    }
    durationSeconds = parsedDuration;
  }

  const game = readLabel(body.game, "game");
  if ("error" in game) return { error: game.error };
  const difficulty = readLabel(body.difficulty, "difficulty");
  if ("error" in difficulty) return { error: difficulty.error };

  // ---- optional Settings preferences -------------------------------------
  let preferences: GameplaySession["preferences"];
  if (body.preferences !== undefined) {
    const parsedPreferences = parseCoachPreferences(body.preferences);
    if ("error" in parsedPreferences) return { error: parsedPreferences.error };
    preferences = parsedPreferences.preferences;
  }

  return {
    session: {
      game: game.value ?? "minesweeper",
      difficulty: difficulty.value,
      rows: shape.rows,
      columns: shape.columns,
      mineCount,
      outcome: outcome as GameplaySession["outcome"],
      durationSeconds,
      mines,
      moves,
      ...(preferences ? { preferences } : {}),
    },
  };
}
