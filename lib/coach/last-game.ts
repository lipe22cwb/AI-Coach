import type { GameplaySession } from "./types";
import { validateSession } from "./validate";

// The last completed game, kept in the browser so the Coaching tab can offer to
// analyse it without a database. The stored session is validated with the same
// `validateSession` used by the API, so a corrupt or outdated entry is ignored
// instead of producing a broken report.

export const LAST_GAME_STORAGE_KEY = "ai-coach:last-game:v1";

export type StoredLastGame = {
  session: GameplaySession;
  /** ISO timestamp of when the game ended. */
  savedAt: string;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode or a blocked storage API.
    return null;
  }
}

/**
 * Save a completed game. Returns the stored value, or `null` when the session
 * is invalid or storage is unavailable — the Play report still works either way.
 */
export function saveLastGame(session: GameplaySession): StoredLastGame | null {
  const store = storage();
  if (!store) return null;

  const validated = validateSession(session);
  if ("error" in validated) return null;

  const stored: StoredLastGame = {
    session: validated.session,
    savedAt: new Date().toISOString(),
  };

  try {
    store.setItem(LAST_GAME_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  } catch {
    // Quota exceeded or storage disabled.
    return null;
  }
}

/** Read the last completed game, ignoring anything that no longer validates. */
export function loadLastGame(): StoredLastGame | null {
  const store = storage();
  if (!store) return null;

  let raw: string | null;
  try {
    raw = store.getItem(LAST_GAME_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  // A corrupt or outdated entry is removed instead of being parsed on every
  // visit. The Play tab will write a fresh one when the next game ends.
  const discard = (): null => {
    clearLastGame();
    return null;
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return discard();
  }
  if (typeof parsed !== "object" || parsed === null) return discard();

  const value = parsed as Record<string, unknown>;
  if (typeof value.savedAt !== "string") return discard();

  const validated = validateSession(value.session);
  if ("error" in validated) return discard();

  return { session: validated.session, savedAt: value.savedAt };
}

/** Remove the stored game. Used by tests and by a future "forget" action. */
export function clearLastGame(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(LAST_GAME_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
