import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const get = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const ranked = get("../supabase/migrations/202610280001_ranked_gameplay_baseline.sql");
const publicRate = get(
  "../supabase/migrations/20261029021535_public_coach_global_rate_limit.sql",
);
const cleanup = get("../supabase/migrations/20261029024138_coach_counter_cleanup.sql");
const doc = get("../docs/STAGING-MIGRATION-ALIGNMENT.md");

test("Ranked baseline no longer uses corrupted state field names", () => {
  assert.doesNotMatch(
    ranked,
    /v_state\.tate\.f_positions|SET tate\.f_positions|v_state\.tirst_move_done|v_state\.tlagged_positions/,
  );
  assert.match(ranked, /SET flagged_positions = v_flags/);
  assert.match(ranked, /v_flags := v_state\.flagged_positions/);
});

test("public Coaching historical migration enforces shared atomic 120/minute", () => {
  assert.match(publicRate, /on conflict \(bucket_start\) do update/);
  assert.match(publicRate, /where c\.usage_count < 120/);
  assert.match(publicRate, /security invoker/i);
  assert.match(
    publicRate,
    /revoke all on function public\.reserve_public_coach_request\(\) from public, anon, authenticated/i,
  );
  assert.match(
    publicRate,
    /grant execute on function public\.reserve_public_coach_request\(\) to service_role/i,
  );
});

test("historical cleanup migration installs no automatic data deletion or schedule", () => {
  assert.match(
    cleanup,
    /create or replace function coach_maintenance\.cleanup_old_coach_counters\(\)/i,
  );
  assert.match(cleanup, /interval '30 days'/i);
  assert.match(cleanup, /limit 5000/gi);
  assert.doesNotMatch(
    cleanup,
    /select\s+\*\s+from\s+coach_maintenance\.cleanup_old_coach_counters|cron\.schedule|create extension\s+pg_cron/i,
  );
  assert.match(
    cleanup,
    /revoke all on function coach_maintenance\.cleanup_old_coach_counters\(\)/i,
  );
});

test("account migration's existing version is retained and duplicate not added", () => {
  const account = get("../supabase/migrations/202610220001_account_preferences.sql");
  assert.match(account, /create table if not exists public\.user_preferences/i);
  assert.match(doc, /20261029023220/);
  assert.match(doc, /migration repair 202610220001 --status applied/);
  assert.match(doc, /migration repair 20261029023220 --status reverted/);
});

test("staging runbook forbids automatic Ranked installs and production changes", () => {
  assert.match(doc, /squusumcekygqdkaabcm/);
  assert.match(doc, /bzjkmiwwrpcshumamkvq/);
  assert.match(doc, /Do \*\*not\*\* run `supabase db push`/);
  assert.match(doc, /Ranked.*unapplied/s);
});
