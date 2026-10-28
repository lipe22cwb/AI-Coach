// Static safety regression for the UNAPPLIED SQL migration.
// This is not a substitute for staging integration tests against PostgreSQL.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rawSql = readFileSync(
  new URL(
    "../supabase/migrations/202610280002_secure_ranked_results.sql",
    import.meta.url,
  ),
  "utf8",
);
// Exclude documentation comments from executable-SQL safety assertions.
const sql = rawSql.replace(/^--.*$/gm, "");

test("migration does not recreate the old match-creation timer", () => {
  assert.doesNotMatch(sql, /create\s+table\s+public\.ranked_match_timing\b/i);
  assert.doesNotMatch(sql, /record_ranked_match_start\s*\(/i);
});

test("only an active-to-won transition is recorded", () => {
  assert.match(sql, /old\.status\s+is\s+distinct\s+from\s+'active'/i);
  assert.match(sql, /new\.status\s+is\s+distinct\s+from\s+'won'/i);
});

test("timing is obtained from the game's server-owned fields", () => {
  assert.match(sql, /new\.started_at/);
  assert.match(sql, /new\.finished_at/);
  assert.match(sql, /new\.duration_ms/);
  assert.match(
    sql,
    /floor\(extract\(epoch from \(new\.finished_at - new\.started_at\)\) \* 1000\)/i,
  );
  assert.doesNotMatch(sql, /clock_timestamp\s*\(/i);
});

test("stored board evidence is required for a victory", () => {
  assert.match(sql, /cardinality\(s\.mine_positions\) = 40/);
  assert.match(sql, /cardinality\(s\.revealed_positions\) = 216/);
  assert.match(sql, /count\(distinct mine\.position\)/i);
  assert.match(sql, /count\(distinct revealed\.position\)/i);
  assert.match(sql, /revealed\.position = any\(s\.mine_positions\)/i);
});

test("only server may read verified results and client write grants are absent", () => {
  assert.match(
    sql,
    /alter table public\.ranked_verified_results enable row level security;/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.ranked_verified_results from public, anon, authenticated, service_role;/i,
  );
  assert.match(
    sql,
    /grant select on table public\.ranked_verified_results to service_role;/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.ranked_verified_results\s+to\s+service_role/i,
  );
});

test("one win per match; no backfill or JSON import", () => {
  assert.match(sql, /match_id uuid primary key/);
  assert.match(sql, /on conflict \(match_id\) do nothing/i);
  assert.doesNotMatch(
    sql,
    /insert\s+into\s+public\.ranked_verified_results[\s\S]*from\s+public\.ranked_matches/i,
  );
});

test("privileged API can read but cannot directly write official results", () => {
  assert.match(
    sql,
    /revoke all on table public\.ranked_verified_results from public, anon, authenticated, service_role;/i,
  );
  assert.match(
    sql,
    /grant select on table public\.ranked_verified_results to service_role;/i,
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /after update of status on public\.ranked_matches/i);
});
