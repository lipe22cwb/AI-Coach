// Phase 5: compact checksum of the board exactly as it was visible to a player.
// This is an accidental-desynchronization check, NOT tamper-proof security.
// The hidden mine layout must NEVER enter this checksum.

type Cell = {
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number | null;
  mine?: boolean;
  exploded?: boolean;
};

function visibleToken(cell: Cell): string {
  if (!cell.revealed) return cell.flagged ? "F" : ".";
  if (cell.mine || cell.exploded || cell.adjacentMines === null) return "M";
  return String(cell.adjacentMines);
}

function checksum(tokens: readonly string[], rows: number, columns: number): string {
  // FNV-1a over board dimensions and one visible token per square.
  const visible = `${rows}x${columns}:${tokens.join("")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < visible.length; i += 1) {
    hash ^= visible.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Called by the live board right after each changed action. */
export function visibleBoardHash(board: readonly (readonly Cell[])[]): string {
  const rows = board.length;
  const columns = board[0]?.length ?? 0;
  if (rows < 2 || columns < 2 || !board.every((row) => row.length === columns)) {
    throw new Error("Cannot hash an invalid game board.");
  }
  return checksum(
    board.flatMap((row) => row.map(visibleToken)),
    rows,
    columns,
  );
}

/** Called by replay to verify its own result matches the live recording. */
export function visibleReplayHash(
  cells: readonly Cell[],
  rows: number,
  columns: number,
): string {
  if (rows < 2 || columns < 2 || rows * columns !== cells.length) {
    throw new Error("Cannot hash an invalid replay board.");
  }
  return checksum(cells.map(visibleToken), rows, columns);
}
