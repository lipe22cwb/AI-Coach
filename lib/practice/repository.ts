import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPracticeSession,
  loadRecentPracticeSessions,
  removeLocalPracticeSessions,
  savePracticeSessionLocally,
  type PracticeSession,
  type SavedPracticeSession,
} from "./history.ts";
import { getSupabaseBrowserClient } from "../supabase/client.ts";

/** Storage boundary for completed Practice recordings. UI code depends on this contract only. */
export interface PracticeRepository {
  save(session: PracticeSession): Promise<SavedPracticeSession>;
  listRecent(): Promise<SavedPracticeSession[]>;
  load(id?: string | null): Promise<SavedPracticeSession | null>;
  getStorageMode(): Promise<"local" | "account">;
  syncPending(): Promise<void>;
}

type PracticeClientProvider = () => SupabaseClient | null;

type PracticeGameRow = {
  id: string;
  client_record_id: string;
  game: "minesweeper";
  difficulty: string;
  rows: number;
  columns: number;
  mine_count: number;
  outcome: "win" | "loss";
  duration_seconds: number;
  mine_indices: number[];
  completed_at: string;
  move_count: number;
};

type PracticeMoveRow = {
  game_id: string;
  move_number: number;
  row: number;
  column: number;
  action_type: "reveal" | "flag" | "unflag" | "chord";
  at_ms: number | null;
  after_hash: string | null;
};

function toGameRow(userId: string, saved: SavedPracticeSession) {
  return {
    user_id: userId,
    client_record_id: saved.id,
    game: saved.game,
    mode: "practice",
    difficulty: saved.difficulty,
    rows: saved.rows,
    columns: saved.columns,
    mine_count: saved.mineCount,
    outcome: saved.outcome,
    duration_seconds: saved.durationSeconds,
    mine_indices: saved.mines,
    move_count: saved.moves.length,
    completed_at: saved.completedAt,
    recording_version: 1,
  };
}

function toMoveRows(gameId: string, session: PracticeSession): PracticeMoveRow[] {
  return session.moves.map((move, index) => ({
    game_id: gameId,
    move_number: index + 1,
    row: move.row,
    column: move.col,
    action_type: move.action,
    at_ms: move.atMs ?? null,
    after_hash: move.afterHash ?? null,
  }));
}

function fromRows(game: PracticeGameRow, moves: PracticeMoveRow[]): SavedPracticeSession {
  return {
    id: game.client_record_id,
    game: game.game,
    difficulty: game.difficulty,
    rows: game.rows,
    columns: game.columns,
    mineCount: game.mine_count,
    outcome: game.outcome,
    durationSeconds: game.duration_seconds,
    mines: game.mine_indices,
    completedAt: game.completed_at,
    moves: moves
      .sort((left, right) => left.move_number - right.move_number)
      .map((move) => ({
        row: move.row,
        col: move.column,
        action: move.action_type,
        ...(move.at_ms === null ? {} : { atMs: move.at_ms }),
        ...(move.after_hash === null ? {} : { afterHash: move.after_hash }),
      })),
  };
}

async function getSignedInUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

async function writeCloudSession(
  client: SupabaseClient,
  userId: string,
  saved: SavedPracticeSession,
): Promise<SavedPracticeSession> {
  const { data: game, error: gameError } = await client
    .from("practice_games")
    .upsert(toGameRow(userId, saved), { onConflict: "user_id,client_record_id" })
    .select("id")
    .single();
  if (gameError) throw gameError;

  const { error: movesError } = await client
    .from("practice_game_moves")
    .upsert(toMoveRows(game.id, saved), { onConflict: "game_id,move_number" });
  if (movesError) throw movesError;
  return saved;
}

/** Current browser behavior: recordings remain in this tab's sessionStorage. */
export function createLocalPracticeRepository(): PracticeRepository {
  return {
    async save(session) {
      const saved = savePracticeSessionLocally(session);
      if (!saved) throw new Error("Could not save this Practice recording locally.");
      return saved;
    },
    async listRecent() {
      return loadRecentPracticeSessions();
    },
    async load(id) {
      const session = loadPracticeSession(id);
      if (!session) return null;
      return id
        ? (loadRecentPracticeSessions().find((game) => game.id === id) ?? null)
        : (loadRecentPracticeSessions()[0] ?? null);
    },
    async getStorageMode() {
      return "local";
    },
    async syncPending() {},
  };
}

/**
 * Account adapter. It imports current-tab recordings once after sign-in and
 * clears them only after every game and ordered move has been written.
 */
export function createSupabasePracticeRepository(
  getClient: PracticeClientProvider = getSupabaseBrowserClient,
): PracticeRepository {
  const local = createLocalPracticeRepository();
  let migration: { userId: string; promise: Promise<void> } | null = null;

  async function migrateLocalRecords(client: SupabaseClient, userId: string) {
    if (!migration || migration.userId !== userId) {
      const promise = (async () => {
        const localSessions = loadRecentPracticeSessions();
        for (const session of [...localSessions].reverse()) {
          await writeCloudSession(client, userId, session);
        }
        removeLocalPracticeSessions(localSessions.map((session) => session.id));
      })().finally(() => {
        if (migration?.promise === promise) migration = null;
      });
      migration = { userId, promise };
    }
    await migration.promise;
    if (loadRecentPracticeSessions().length > 0) {
      await migrateLocalRecords(client, userId);
    }
  }

  async function withAccount<T>(
    operation: (client: SupabaseClient, userId: string) => Promise<T>,
    fallback: () => Promise<T>,
  ) {
    const client = getClient();
    if (!client) return fallback();
    const userId = await getSignedInUser(client);
    if (!userId) return fallback();

    await migrateLocalRecords(client, userId);
    return operation(client, userId);
  }

  const listRecent = async () =>
    withAccount(
      async (client, userId) => {
        const { data: games, error: gamesError } = await client
          .from("practice_games")
          .select(
            "id,client_record_id,game,difficulty,rows,columns,mine_count,outcome,duration_seconds,mine_indices,completed_at,move_count",
          )
          .eq("user_id", userId)
          .order("completed_at", { ascending: false })
          .limit(100);
        if (gamesError) throw gamesError;
        if (!games?.length) return [];

        const { data: moves, error: movesError } = await client
          .from("practice_game_moves")
          .select("game_id,move_number,row,column,action_type,at_ms,after_hash")
          .in(
            "game_id",
            games.map((game) => game.id),
          );
        if (movesError) throw movesError;
        return (games as PracticeGameRow[]).map((game) =>
          fromRows(
            game,
            ((moves ?? []) as PracticeMoveRow[]).filter(
              (move) => move.game_id === game.id,
            ),
          ),
        );
      },
      () => local.listRecent(),
    );

  return {
    async save(session) {
      // First save locally so a transient network failure cannot discard a game.
      const saved = await local.save(session);
      await withAccount(
        async () => undefined,
        async () => undefined,
      );
      return saved;
    },
    listRecent,
    async load(id) {
      const sessions = await listRecent();
      return id
        ? (sessions.find((session) => session.id === id) ?? null)
        : (sessions[0] ?? null);
    },
    async getStorageMode() {
      const client = getClient();
      if (!client) return "local";
      return (await getSignedInUser(client)) ? "account" : "local";
    },
    async syncPending() {
      const client = getClient();
      if (!client) return;
      const userId = await getSignedInUser(client);
      if (!userId) return;
      await migrateLocalRecords(client, userId);
    },
  };
}

/** Select storage without leaking Supabase details into the UI. */
export function createPracticeRepository(
  getClient: PracticeClientProvider = getSupabaseBrowserClient,
): PracticeRepository {
  return createSupabasePracticeRepository(getClient);
}
