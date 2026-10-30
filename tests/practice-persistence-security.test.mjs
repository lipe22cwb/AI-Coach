import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261030015150_practice_game_persistence.sql",
    import.meta.url,
  ),
  "utf8",
);
const repository = await readFile(
  new URL("../lib/practice/repository.ts", import.meta.url),
  "utf8",
);

test("Practice tables require authenticated access and have RLS enabled", () => {
  assert.match(
    migration,
    /alter table public\.practice_games enable row level security/i,
  );
  assert.match(
    migration,
    /alter table public\.practice_game_moves enable row level security/i,
  );
  assert.match(migration, /revoke all on public\.practice_games from public, anon/i);
  assert.match(migration, /revoke all on public\.practice_game_moves from public, anon/i);
  assert.equal(
    (migration.match(/for (select|insert|update|delete) to authenticated/gi) ?? [])
      .length,
    8,
  );
});

test("all Practice row policies scope access to the signed-in owner", () => {
  const gamePolicies =
    migration.match(
      /create policy "[^"]+"\s+on public\.practice_games for (select|insert|update|delete)[\s\S]*?;/gi,
    ) ?? [];
  const movePolicies =
    migration.match(
      /create policy "[^"]+"\s+on public\.practice_game_moves for (select|insert|update|delete)[\s\S]*?;/gi,
    ) ?? [];
  assert.equal(gamePolicies.length, 4);
  assert.equal(movePolicies.length, 4);
  for (const policy of gamePolicies) {
    assert.match(policy, /user_id/);
    assert.match(policy, /auth\.uid\(\)/);
  }
  for (const policy of movePolicies) {
    assert.match(policy, /game\.user_id = \(select auth\.uid\(\)\)/);
    assert.match(policy, /game\.id = practice_game_moves\.game_id/);
  }
});

test("retention and cascades affect Practice history only", () => {
  assert.match(migration, /references auth\.users \(id\) on delete cascade/i);
  assert.match(migration, /references public\.practice_games \(id\) on delete cascade/i);
  assert.match(migration, /limit 100/i);
  assert.doesNotMatch(migration, /ranked_(matches|results|games)/i);
});

test("browser repository writes only Practice tables and filters by account", () => {
  assert.match(repository, /\.from\("practice_games"\)/);
  assert.match(repository, /\.from\("practice_game_moves"\)/);
  assert.match(repository, /\.eq\("user_id", userId\)/);
  assert.doesNotMatch(repository, /\.from\("ranked_[^"]+"\)/);
});
