export type Difficulty = "beginner" | "intermediate" | "expert";

export type DifficultySettings = {
  label: string;
  rows: number;
  columns: number;
  mines: number;
};

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: { label: "Beginner", rows: 9, columns: 9, mines: 10 },
  intermediate: { label: "Intermediate", rows: 16, columns: 16, mines: 40 },
  expert: { label: "Expert", rows: 16, columns: 30, mines: 99 },
};

export const DEFAULT_DIFFICULTY: Difficulty = "intermediate";

// Backwards-compatible defaults for any existing components that still import these.
export const BOARD_SIZE = DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY].rows;
export const TOTAL_MINES = DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY].mines;
export const DIFFICULTY_LABEL = DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY].label;
