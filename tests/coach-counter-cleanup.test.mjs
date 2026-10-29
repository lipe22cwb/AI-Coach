import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`../scripts/sql/${name}`, import.meta.url), "utf8");

const setup = read("coach-counter-cleanup.sql");
const probe = read("coach-counter-cleanup-staging-probe.sql");
const schedule = read("coach-counter-cleanup-schedule.example.sql");

test("cleanup function is private, invoker-rights, and has a fixed search path", () => {
  assert.match(setup, /create schema if not exists coach_maintenance;/i);
  assert.match(
    setup,
    /create or replace function coach_maintenance\.cleanup_old_coach_counters\(\)/i,
  );
  assert.match(setup, /security invoker/i);
  assert.match(setup, /set search_path = ''/i);
});

test("browser and server API roles cannot execute the cleanup function", () => {
  assert.match(
    setup,
    /revoke all on function coach_maintenance\.cleanup_old_coach_counters\(\)\s+from public, anon, authenticated, service_role;/i,
  );
  assert.match(
    setup,
    /revoke all on schema coach_maintenance from public, anon, authenticated, service_role;/i,
  );
});

test("retention period is hardcoded to 30 days", () => {
  assert.match(setup, /transaction_timestamp\(\) - interval '30 days'/i);
  assert.equal((setup.match(/bucket_start < v_cutoff/g) ?? []).length, 2);
});

test("both counter tables are cleaned, without touching user or game data", () => {
  assert.match(setup, /delete from public\.coach_ai_quota_counters/i);
  assert.match(setup, /delete from public\.coach_public_minute_counters/i);
  assert.doesNotMatch(
    setup,
    /delete from (?:public\.)?(?:user_preferences|auth\.users|ranked_matches)/i,
  );
});

test("deletion is limited to 5000 rows per table and can skip locked rows", () => {
  assert.equal((setup.match(/limit 5000/g) ?? []).length, 2);
  assert.equal((setup.match(/for update skip locked/g) ?? []).length, 2);
});

test("paid counter gets a cleanup index on bucket_start", () => {
  assert.match(
    setup,
    /create index if not exists coach_ai_quota_bucket_start_idx\s+on public\.coach_ai_quota_counters \(bucket_start\)/i,
  );
});

test("migration template does not automatically enable pg_cron or call cleanup", () => {
  assert.doesNotMatch(setup, /create extension|cron\.schedule\(/i);
  assert.doesNotMatch(
    setup,
    /select\s+\*\s+from coach_maintenance\.cleanup_old_coach_counters\(\)/i,
  );
});

test("staging probe checks both expired tables and retains a recent row", () => {
  assert.match(probe, /begin;/i);
  assert.match(
    probe,
    /select \* from coach_maintenance\.cleanup_old_coach_counters\(\)/i,
  );
  assert.match(probe, /recent paid quota probe row was deleted/i);
  assert.match(probe, /old public rate probe row survived cleanup/i);
  assert.match(probe, /rollback;/i);
  assert.doesNotMatch(probe, /commit;/i);
});

test("optional once-daily job is separate and includes unschedule guidance", () => {
  assert.match(schedule, /cron\.schedule\(/i);
  assert.match(schedule, /'15 3 \* \* \*'/);
  assert.match(schedule, /cron\.unschedule/);
});
