// Data type for a playable Minesweeper cell. The board is generated at runtime.
export type GameCell = {
  mine: boolean;
  adjacentMines: number;
  revealed: boolean;
  flagged: boolean;
};
