import type { GameplayMove } from "@/lib/coach/types";

// The revised prototype needs a small temporary set of games for testing
// gameplay-to-coaching. It is not a lifetime profile or a Ranked record.
const RECENT_SESSIONS_KEY = "mindsweeper.practice.recentSessions.v1";
export const LAST_PRACTICE_GAME_KEY = "mindsweeper.practice.lastCompletedGame.v1";
export const RECENT_SESSION_LIMIT = 5;

export type PracticeSession = {
  game: "minesweeper";
  difficulty: string;
  rows: number;
  columns: number;
  mineCount: number;
  outcome: "win" | "loss";
  durationSeconds: number;
  mines: number[];
  moves: GameplayMove[];
};

export type SavedPracticeSession = PracticeSession & {
  id: string;
  completedAt: string;
};

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPracticeSession(value: unknown): value is PracticeSession {
  if (!value || typeof value !== "object") return false;
  const game = value as Partial<PracticeSession>;
  if (
    game.game !== "minesweeper" ||
    typeof game.difficulty !== "string" ||
    !isNonnegativeInteger(game.rows) ||
    !isNonnegativeInteger(game.columns) ||
    game.rows < 2 ||
    game.columns < 2 ||
    game.rows > 50 ||
    game.columns > 50 ||
    !isNonnegativeInteger(game.mineCount) ||
    game.mineCount >= game.rows * game.columns ||
    (game.outcome !== "win" && game.outcome !== "loss") ||
    !isNonnegativeInteger(game.durationSeconds) ||
    !Array.isArray(game.mines) ||
    game.mines.length !== game.mineCount ||
    !game.mines.every(
      (index) => isNonnegativeInteger(index) && index < game.rows! * game.columns!,
    ) ||
    new Set(game.mines).size !== game.mineCount ||
    !Array.isArray(game.moves) ||
    game.moves.length === 0 ||
    game.moves.length > 10000
  ) {
    return false;
  }

  return game.moves.every(
    (move) =>
      !!move &&
      isNonnegativeInteger(move.row) &&
      move.row < game.rows! &&
      isNonnegativeInteger(move.col) &&
      move.col < game.columns! &&
      ["reveal", "flag", "unflag", "chord"].includes(move.action) &&
      (move.atMs === undefined || isNonnegativeInteger(move.atMs)) &&
      (move.afterHash === undefined ||
        (typeof move.afterHash === "string" && /^[0-9a-f]{8}$/.test(move.afterHash))),
  );
}

function isSavedSession(value: unknown): value is SavedPracticeSession {
  if (!isPracticeSession(value)) return false;
  const saved = value as SavedPracticeSession;
  return (
    typeof saved.id === "string" &&
    saved.id.length > 0 &&
    typeof saved.completedAt === "string" &&
    Number.isFinite(Date.parse(saved.completedAt))
  );
}

// sessionStorage lasts for the current browser tab/session only, unlike the
// old localStorage lifetime counters. Malformed data is ignored, not trusted.
export function loadRecentPracticeSessions(): SavedPracticeSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RECENT_SESSIONS_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isSavedSession).slice(0, RECENT_SESSION_LIMIT);
  } catch (error) {
    console.warn("Could not read this tab's Practice recordings:", error);
    return [];
  }
}

export function loadPracticeSession(id?: string | null): PracticeSession | null {
  if (typeof window === "undefined") return null;
  const recent = loadRecentPracticeSessions();
  if (id) return recent.find((game) => game.id === id) ?? null;
  if (recent.length > 0) return recent[0];

  // Backward compatibility with the previous last-game recorder.
  try {
    const raw = window.sessionStorage.getItem(LAST_PRACTICE_GAME_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPracticeSession(value) ? value : null;
  } catch {
    return null;
  }
}

// Call once per finished game. Preserve the full structured move sequence and
// mine layout so the analysis can reconstruct visible board states later.
export function savePracticeSession(session: PracticeSession): void {
  if (typeof window === "undefined" || !isPracticeSession(session)) return;

  const saved: SavedPracticeSession = {
    ...session,
    moves: session.moves.map((move) => ({ ...move })),
    mines: [...session.mines],
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    completedAt: new Date().toISOString(),
  };

  try {
    const history = [saved, ...loadRecentPracticeSessions()].slice(
      0,
      RECENT_SESSION_LIMIT,
    );
    window.sessionStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(history));
    window.sessionStorage.setItem(LAST_PRACTICE_GAME_KEY, JSON.stringify(saved));
  } catch (error) {
    // Storage is optional for a playable game. Never misrepresent an error as
    // a permanent saved profile or alter a game outcome because of storage.
    console.warn("Could not save this tab's Practice game:", error);
  }
}
