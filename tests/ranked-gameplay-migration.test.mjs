import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

// Static checks only. A clean database reset and live RPC security tests are
// separate follow-up work. Never run this migration on the existing project.
const base = new URL("../supabase/migrations/", import.meta.url);
const file = new URL("202610280001_ranked_gameplay_baseline.sql", base);
const next = new URL("202610280002_secure_ranked_results.sql", base);
const sql = readFileSync(file, "utf8");
const functions = [
  ["start_ranked_match", "uuid"],
  ["get_ranked_visible_board", "uuid,uuid"],
  ["reveal_first_ranked_cell", "uuid,uuid,integer,integer"],
  ["reveal_ranked_cell", "uuid,uuid,integer,integer"],
  ["toggle_ranked_flag", "uuid,uuid,integer,integer"],
  ["chord_ranked_cell", "uuid,uuid,integer,integer"],
];

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("the gameplay baseline is before the existing verified results migration", () => {
  assert.ok(
    existsSync(next),
    "The later results migration must already exist in the repo.",
  );
  assert.ok(file.pathname < next.pathname);
});

test("the baseline fails closed when the live schema already exists", () => {
  assert.match(sql, /to_regclass\('public\.ranked_matches'\) is not null/i);
  assert.match(sql, /to_regclass\('public\.ranked_verified_results'\) is not null/i);
  assert.match(sql, /raise exception 'Ranked gameplay schema already exists/i);
  assert.ok(
    sql.indexOf("$baseline_guard$") < sql.indexOf("create table public.ranked_matches"),
  );
});

test("three server-owned Ranked tables, foreign keys, and one-active-game index exist", () => {
  for (const table of ["ranked_matches", "ranked_match_state", "ranked_match_moves"]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, "i"));
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security;`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated;`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant select, insert, update, delete on public\\.${table} to service_role;`,
        "i",
      ),
    );
  }
  assert.match(sql, /references auth\.users \(id\) on delete cascade/i);
  assert.match(sql, /create unique index ranked_one_active_match/i);
  assert.match(sql, /where status = 'active'/i);
  assert.match(
    sql,
    /constraint ranked_match_moves_pkey primary key \(match_id, move_number\)/i,
  );
});

test("the six original functions are present with browser execution revoked", () => {
  for (const [name, signature] of functions) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, "i"));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\(${escaped(signature)}\\) from public, anon, authenticated;`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}\\(${escaped(signature)}\\) to service_role;`,
        "i",
      ),
    );
  }
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\./gi) ?? []).length, 6);
  assert.equal((sql.match(/\$function\$/g) ?? []).length, 12);
});

test("Ranked moves stay server-controlled and use existing timing and first-click rules", () => {
  assert.match(sql, /ON CONFLICT \(user_id\) WHERE status = 'active'/i);
  assert.match(sql, /ORDER BY gen_random_uuid\(\)/i);
  assert.match(sql, /started_at = clock_timestamp\(\)/i);
  assert.match(sql, /first_move_done/i);
  assert.match(sql, /FOR UPDATE/i);
  assert.match(sql, /cardinality\(v_all_revealed\) = 216/i);
  assert.match(sql, /set search_path to ''/i);
  assert.doesNotMatch(sql, /^\s*security definer\s*$/im);
});
