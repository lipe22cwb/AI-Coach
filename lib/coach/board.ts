import type { OpeningCell } from "./types";

// Board geometry for the coaching engine.
//
// Boards are not always square: Beginner is 9×9, Intermediate 16×16 and Expert
// is 16×30. Everything here works on separate row and column counts, so the
// analyser can replay any difficulty. Kept dependency-free on purpose, like the
// rest of `lib/coach`.

export const MIN_BOARD_DIMENSION = 2;
export const MAX_BOARD_DIMENSION = 50;

export type BoardShape = { rows: number; columns: number };

/** The shape a request describes, accepting both the rectangular and legacy fields. */
export type BoardShapeInput = {
  /** Legacy square-board field: boardSize × boardSize. */
  boardSize?: number;
  rows?: number;
  columns?: number;
};

/**
 * Resolve the board shape from `rows`/`columns` (preferred) or the legacy
 * square `boardSize`. Returns null when the shape is missing or unusable, so
 * callers can answer with a validation error instead of guessing.
 */
export function boardShapeOf(input: BoardShapeInput): BoardShape | null {
  const rows = input.rows ?? input.boardSize;
  const columns = input.columns ?? input.boardSize;
  if (rows === undefined || columns === undefined) return null;
  if (!Number.isInteger(rows) || !Number.isInteger(columns)) return null;
  if (rows < MIN_BOARD_DIMENSION || rows > MAX_BOARD_DIMENSION) return null;
  if (columns < MIN_BOARD_DIMENSION || columns > MAX_BOARD_DIMENSION) return null;
  return { rows, columns };
}

export function cellCountOf({ rows, columns }: BoardShape): number {
  return rows * columns;
}

/** Row-major index of a square. Column count decides the row width. */
export function indexOf(row: number, col: number, columns: number): number {
  return row * columns + col;
}

export function rowOf(index: number, columns: number): number {
  return Math.floor(index / columns);
}

export function colOf(index: number, columns: number): number {
  return index % columns;
}

/** Indices of the up-to-eight squares around `index`. */
export function neighboursOf(index: number, rows: number, columns: number): number[] {
  const row = rowOf(index, columns);
  const col = colOf(index, columns);
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= rows || c >= columns) continue;
      out.push(indexOf(r, c, columns));
    }
  }
  return out;
}

/** Where the player opened the board, using the real board edges. */
export function openingCellOf(
  row: number,
  col: number,
  rows: number,
  columns: number,
): OpeningCell {
  const onVerticalEdge = row === 0 || row === rows - 1;
  const onHorizontalEdge = col === 0 || col === columns - 1;
  if (onVerticalEdge && onHorizontalEdge) return "corner";
  if (onVerticalEdge || onHorizontalEdge) return "edge";
  return "center";
}
