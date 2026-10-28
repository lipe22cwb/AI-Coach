// Shared shapes for the coaching feature: the game data we analyse, the
// report we return, and the small pieces the rule engine fills in.
//
// This file has no framework imports on purpose. The exact same code runs in
// the API route, in a future test script and in the browser fallback.

export type MoveAction = "reveal" | "flag" | "unflag" | "chord";

/** One action the player took, in the order they took it. */
export type GameplayMove = {
  /** Zero-based row and column of the square the action happened on. */
  row: number;
  col: number;
  action: MoveAction;
  /** Optional time since the game started, in milliseconds. */
  atMs?: number;
  /** Optional Phase 5 checksum of the visible board after the action. */
  afterHash?: string;
};

export type GameplayOutcome = "win" | "loss" | "in-progress";

/**
 * One recorded Minesweeper game.
 *
 * `mines` is optional. Without it the rule engine can still describe the
 * surface of the game (pace, flags, opening move) but it cannot replay the
 * board, so it cannot tell a proven-safe click from a lucky guess. The game
 * code should always send the mine layout when it is available.
 */
export type GameplaySession = {
  /** Lets the API grow to other games later. Defaults to "minesweeper". */
  game?: string;
  difficulty?: string;
  /** The board is square: boardSize × boardSize squares. */
  boardSize: number;
  mineCount: number;
  outcome: GameplayOutcome;
  durationSeconds?: number;
  /**
   * Row-major indices of every mine. Index 0 is the top-left square, so row 1
   * column 3 on a 9-wide board is index 12. When present the engine replays the
   * exact game.
   */
  mines?: number[];
  moves: GameplayMove[];
};

export type CoachGrade = "S" | "A" | "B" | "C" | "D";

/** Which voice wrote the narrative part of the report. */
export type CoachSource = "rules" | "openai" | "anthropic" | "gemini";

export type OpeningCell = "corner" | "edge" | "center" | "unknown";

export type CoachMetrics = {
  totalMoves: number;
  reveals: number;
  flags: number;
  chords: number;
  /** Reveals that were provably safe before the click. */
  logicalReveals: number;
  /** Reveals that were not provably safe (includes forced guesses). */
  guesses: number;
  /** Guesses made while a provably safe square was still available. */
  avoidableGuesses: number;
  /** Guesses ÷ reveals, rounded to two decimals. */
  guessRate: number;
  correctFlags: number;
  wrongFlags: number;
  /** Correct flags ÷ flags placed, rounded to two decimals. */
  flagAccuracy: number;
  openingCell: OpeningCell;
};

export type CoachKeyMoment = {
  moveNumber: number;
  row: number;
  col: number;
  description: string;
};

/** The report the client renders. Both the rule coach and the AI coach fill it. */
export type CoachReport = {
  headline: string;
  grade: CoachGrade;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  keyMoment: CoachKeyMoment | null;
  nextSteps: string[];
  metrics: CoachMetrics | null;
  source: CoachSource;
  /** Provider model name when an AI provider wrote the narrative; null for rules. */
  model: string | null;
};

/** What the deterministic rule engine produces for one session. */
export type CoachAnalysis = {
  metrics: CoachMetrics | null;
  grade: CoachGrade;
  score: number;
  headline: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  keyMoment: CoachKeyMoment | null;
  nextSteps: string[];
  /**
   * Plain-language notes about how the analysis was made, e.g. whether the
   * mine layout was available. Shown to the user so the coach is honest about
   * how much it could actually see.
   */
  notes: string[];
};

/** The full response body of POST /api/coach. */
export type CoachResult = {
  report: CoachReport;
  /** Present when the AI providers were unavailable and the rules answered. */
  fallbackReason: string | null;
};
