import type { GameplaySession } from "./types";

// Two recorded beginner games (9 × 9, 10 mines) used by the demo button on the
// Coaching page and by the API's GET handler. The mine layout is included so the
// rule engine can replay every decision.
//
// Shapes here match what a future playable board should send: the same board
// size and mine count the player chose, the outcome, and the ordered list of
// moves. Coordinates are zero-based rows and columns.

const MINES = [5, 9, 23, 24, 35, 36, 58, 65, 69, 72];

/** A tidy win: every reveal was either certain or a forced guess. */
export const SAMPLE_WIN_SESSION: GameplaySession = {
  game: "minesweeper",
  difficulty: "Beginner",
  boardSize: 9,
  mineCount: 10,
  outcome: "win",
  durationSeconds: 38,
  mines: MINES,
  moves: [
    { row: 2, col: 4, action: "reveal" },
    { row: 4, col: 5, action: "reveal" },
    { row: 2, col: 5, action: "flag" },
    { row: 2, col: 6, action: "flag" },
    { row: 3, col: 8, action: "flag" },
    { row: 6, col: 4, action: "flag" },
    { row: 7, col: 6, action: "flag" },
    { row: 2, col: 7, action: "reveal" },
    { row: 1, col: 5, action: "reveal" },
    { row: 0, col: 5, action: "flag" },
    { row: 1, col: 6, action: "reveal" },
    { row: 0, col: 6, action: "reveal" },
    { row: 0, col: 7, action: "reveal" },
    { row: 7, col: 4, action: "reveal" },
    { row: 7, col: 5, action: "reveal" },
    { row: 7, col: 3, action: "reveal" },
    { row: 7, col: 2, action: "flag" },
    { row: 8, col: 3, action: "reveal" },
    { row: 5, col: 0, action: "reveal" },
    { row: 6, col: 0, action: "reveal" },
    { row: 4, col: 0, action: "flag" },
    { row: 8, col: 2, action: "reveal" },
    { row: 2, col: 0, action: "reveal" },
    { row: 3, col: 0, action: "reveal" },
    { row: 1, col: 0, action: "flag" },
    { row: 8, col: 4, action: "reveal" },
    { row: 0, col: 0, action: "reveal" },
    { row: 8, col: 6, action: "reveal" },
    { row: 8, col: 1, action: "reveal" },
    { row: 8, col: 0, action: "flag" },
  ],
};

/**
 * A loss with a lesson: the player had a guaranteed safe move on the board and
 * guessed anyway. This is the sample the Coaching page loads first, because it
 * gives the coach something specific to talk about.
 */
export const SAMPLE_LOSS_SESSION: GameplaySession = {
  game: "minesweeper",
  difficulty: "Beginner",
  boardSize: 9,
  mineCount: 10,
  outcome: "loss",
  durationSeconds: 47,
  mines: MINES,
  moves: [
    { row: 2, col: 2, action: "reveal" },
    { row: 2, col: 5, action: "flag" },
    { row: 2, col: 6, action: "flag" },
    { row: 3, col: 8, action: "flag" },
    { row: 6, col: 4, action: "flag" },
    { row: 7, col: 6, action: "flag" },
    { row: 8, col: 4, action: "reveal" },
    { row: 7, col: 2, action: "flag" },
    { row: 4, col: 0, action: "reveal" },
  ],
};

/** The default sample the demo button uses. */
export const SAMPLE_SESSION = SAMPLE_LOSS_SESSION;
