import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalPracticeRepository,
  createSupabasePracticeRepository,
} from "../lib/practice/repository.ts";
import { removeLocalPracticeSessions } from "../lib/practice/history.ts";

function useBrowserSessionStorage() {
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
  return values;
}

function recording() {
  return {
    game: "minesweeper",
    difficulty: "Beginner",
    rows: 2,
    columns: 2,
    mineCount: 1,
    outcome: "win",
    durationSeconds: 12,
    mines: [3],
    moves: [
      { row: 0, col: 0, action: "reveal", atMs: 300, afterHash: "1234abcd" },
      { row: 1, col: 1, action: "flag" },
    ],
  };
}

function fakeSupabase({ failMoveWrite = false } = {}) {
  const games = [];
  const moves = [];
  let nextId = 0;
  let shouldFailMoveWrite = failMoveWrite;

  return {
    games,
    moves,
    failMoveWrites(value) {
      shouldFailMoveWrite = value;
    },
    client: {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        }),
      },
      from(table) {
        let selectedIds = null;
        let selectedUserId = null;
        const builder = {
          upsert(rows) {
            if (table === "practice_games") {
              for (const row of Array.isArray(rows) ? rows : [rows]) {
                let existing = games.find(
                  (game) =>
                    game.user_id === row.user_id &&
                    game.client_record_id === row.client_record_id,
                );
                if (!existing) {
                  existing = { ...row, id: `db-game-${++nextId}` };
                  games.push(existing);
                } else Object.assign(existing, row);
                builder.upsertedGame = existing;
              }
            } else {
              if (shouldFailMoveWrite)
                return Promise.resolve({ error: new Error("move write failed") });
              for (const row of rows) {
                const existing = moves.find(
                  (move) =>
                    move.game_id === row.game_id && move.move_number === row.move_number,
                );
                if (existing) Object.assign(existing, row);
                else moves.push(row);
              }
              return Promise.resolve({ error: null });
            }
            return builder;
          },
          select() {
            return builder;
          },
          single() {
            return Promise.resolve({
              data: { id: builder.upsertedGame.id },
              error: null,
            });
          },
          eq(column, value) {
            if (column === "user_id") selectedUserId = value;
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          in(_column, values) {
            selectedIds = values;
            return builder;
          },
          then(resolve, reject) {
            const data =
              table === "practice_games"
                ? games.filter(
                    (game) => !selectedUserId || game.user_id === selectedUserId,
                  )
                : moves.filter(
                    (move) => !selectedIds || selectedIds.includes(move.game_id),
                  );
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  };
}

test("local repository saves and reads recordings without Supabase", async () => {
  useBrowserSessionStorage();
  const repository = createLocalPracticeRepository();
  const saved = await repository.save(recording());

  assert.equal((await repository.load(saved.id))?.id, saved.id);
  assert.equal((await repository.listRecent()).length, 1);
});

test("migration cleanup removes only records that were uploaded", async () => {
  useBrowserSessionStorage();
  const repository = createLocalPracticeRepository();
  const first = await repository.save(recording());
  const second = await repository.save({ ...recording(), outcome: "loss" });

  removeLocalPracticeSessions([first.id]);
  assert.deepEqual(
    (await repository.listRecent()).map((session) => session.id),
    [second.id],
  );
});

test("signed-in repository migrates local recordings with ordered moves", async () => {
  useBrowserSessionStorage();
  const local = createLocalPracticeRepository();
  const saved = await local.save(recording());
  const fake = fakeSupabase();
  const repository = createSupabasePracticeRepository(() => fake.client);

  const history = await repository.listRecent();
  assert.equal(history.length, 1);
  assert.equal(history[0].id, saved.id);
  assert.equal(history[0].moves[0].action, "reveal");
  assert.equal(history[0].moves[0].afterHash, "1234abcd");
  assert.deepEqual(
    fake.moves.map((move) => move.move_number),
    [1, 2],
  );
  assert.equal((await local.listRecent()).length, 0);
});

test("signed-in saves persist the game and moves to their account", async () => {
  useBrowserSessionStorage();
  const fake = fakeSupabase();
  const repository = createSupabasePracticeRepository(() => fake.client);

  const saved = await repository.save(recording());
  assert.equal(await repository.getStorageMode(), "account");
  assert.equal(fake.games.length, 1);
  assert.equal(fake.games[0].user_id, "user-1");
  assert.equal(fake.games[0].mode, "practice");
  assert.equal(fake.moves.length, 2);
  assert.equal((await repository.load(saved.id))?.id, saved.id);
});

test("failed account migration keeps the browser copy for retry", async () => {
  useBrowserSessionStorage();
  const local = createLocalPracticeRepository();
  await local.save(recording());
  const fake = fakeSupabase({ failMoveWrite: true });
  const repository = createSupabasePracticeRepository(() => fake.client);

  await assert.rejects(repository.listRecent(), /move write failed/);
  assert.equal((await local.listRecent()).length, 1);
  assert.equal(fake.games.length, 1);
  assert.equal(fake.moves.length, 0);

  fake.failMoveWrites(false);
  await repository.syncPending();
  assert.equal((await local.listRecent()).length, 0);
  assert.equal(fake.games.length, 1, "retry must not duplicate the parent record");
  assert.equal(fake.moves.length, 2);
});
