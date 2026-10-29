import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../scripts/sql/ranked-rollback-probe-body.sql", import.meta.url),
  "utf8",
);
const builder = readFileSync(
  new URL("../scripts/build-ranked-rollback-probe.mjs", import.meta.url),
  "utf8",
);
const docs = readFileSync(
  new URL("../docs/RANKED-DATABASE-VALIDATION.md", import.meta.url),
  "utf8",
);

test("test generator wraps the actual migrations in a single rollback-only transaction", () => {
  assert.match(builder, /"BEGIN;"/);
  assert.match(builder, /"ROLLBACK;"/);
  assert.match(builder, /Unexpected transaction markers/);
  assert.match(builder, /ranked_matches.*IS NOT NULL/);
  assert.doesNotMatch(sql, /^\s*(begin|commit|rollback);\s*$/im);
});

test("SQL probe exercises both real wins and failed forged actions", () => {
  for (const action of [
    "reveal_first_ranked_cell",
    "reveal_ranked_cell",
    "toggle_ranked_flag",
    "chord_ranked_cell",
    "get_ranked_visible_board",
    "ranked_verified_results",
    "Forged result accepted",
    "Invalid coordinate accepted",
    "Chord without flags accepted",
  ])
    assert.ok(sql.includes(action), `Missing test case: ${action}`);
});

test("runbook requires staging only and prohibits remote deployment", () => {
  assert.match(docs, /AI-Coach-Staging/);
  assert.match(docs, /does \*\*not\*\* authorize permanent Ranked installation/);
  assert.match(docs, /Do not enable paid AI/);
});
