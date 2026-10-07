import { BOARD_SIZE, TOTAL_MINES } from "@/lib/game-settings";

// This is the board shown in the mockup, not a generated game.
// Each string is one row: # = covered, f = flag, a space = empty, 1–3 = number.
// Keep the spaces when editing; they are actual squares on the board.

export const BOARD_ROWS = [
  "################",
  "################",
  "#######1 1######",
  "#####f21 12#####",
  "######1   1f####",
  "####212   12####",
  "###f1      1####",
  "####211   12####",
  "##211f1   1f####",
  "##1 111  12#####",
  "#21     12######",
  "#1      1f######",
  "#1     12#######",
  "#1    12########",
  "#111112#########",
  "################",
] as const;

export type DisplayCell = "hidden" | "flag" | "empty" | "1" | "2" | "3";

// The time is fixed while the board is a preview. A real timer will come later.
export const PREVIEW_ELAPSED_TIME = "01:24";

// Catch a missing square here rather than quietly rendering a crooked board.
if (
  BOARD_ROWS.length !== BOARD_SIZE ||
  BOARD_ROWS.some((row) => row.length !== BOARD_SIZE)
) {
  throw new Error(
    `The preview board must have ${BOARD_SIZE} rows of ${BOARD_SIZE} squares.`,
  );
}

function parseCell(character: string): DisplayCell {
  switch (character) {
    case "#":
      return "hidden";
    case "f":
      return "flag";
    case "1":
    case "2":
    case "3":
      return character;
    case " ":
      return "empty";
    default:
      throw new Error(`Unknown preview board character: ${JSON.stringify(character)}`);
  }
}

// React renders one cell per item, so flatten the rows into a single list.
export const DISPLAY_BOARD = BOARD_ROWS.flatMap((row) => [...row].map(parseCell));
export const FLAG_COUNT = DISPLAY_BOARD.filter((cell) => cell === "flag").length;

if (FLAG_COUNT > TOTAL_MINES) {
  throw new Error("The preview board has more flags than the configured mine count.");
}
