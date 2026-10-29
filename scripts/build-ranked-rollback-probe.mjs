// Assemble a pre-deployment Ranked test in ONE rollback-only SQL transaction.
// This script does not connect to Supabase or execute SQL.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  ["202610280001_ranked_gameplay_baseline.sql", ["begin", "commit"]],
  ["202610280002_secure_ranked_results.sql", []],
];

function readMigration(filename, expectedTransactionMarkers) {
  const fullPath = path.join(projectRoot, "supabase", "migrations", filename);
  const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
  const markers = lines
    .filter((line) => /^\s*(?:begin|commit)\s*;\s*$/i.test(line))
    .map((line) => line.trim().replace(/;$/, "").toLowerCase());
  if (JSON.stringify(markers) !== JSON.stringify(expectedTransactionMarkers)) {
    throw new Error(
      `Unexpected transaction markers in ${filename}; manual review required`,
    );
  }
  return lines.filter((line) => !/^\s*(?:begin|commit)\s*;\s*$/i.test(line)).join("\n");
}

const sqlSections = migrations.map(([filename, markers]) =>
  readMigration(filename, markers),
);
const exercise = readFileSync(
  path.join(projectRoot, "scripts", "sql", "ranked-rollback-probe-body.sql"),
  "utf8",
);
if (/^\s*(?:begin|commit|rollback)\s*;\s*$/im.test(exercise)) {
  throw new Error("Test body must not contain an independent transaction boundary");
}

const sql = [
  "-- AI-Coach staging ONLY. The entire script runs in one transaction.",
  "-- No Ranked objects should exist before running this test.",
  "-- On ANY error, stop execution and disconnect; PostgreSQL rolls back the open transaction.",
  "BEGIN;",
  "SET LOCAL statement_timeout = '50s';",
  `DO $guard$ BEGIN
  IF to_regclass('public.ranked_matches') IS NOT NULL
     OR to_regclass('public.ranked_match_state') IS NOT NULL
     OR to_regclass('public.ranked_match_moves') IS NOT NULL
     OR to_regclass('public.ranked_verified_results') IS NOT NULL
     OR to_regprocedure('public.start_ranked_match(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'Ranked objects already exist: do not use this pre-install test';
  END IF;
END $guard$;`,
  ...sqlSections,
  exercise,
  "ROLLBACK;",
  "",
].join("\n\n");

const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(tmpdir(), `ai-coach-ranked-rollback-${process.pid}.sql`);
writeFileSync(output, sql, { flag: "wx", mode: 0o600 });
console.log(`Wrote rollback-only staging test to ${output}`);
console.log("Review the whole SQL before manually executing it in AI-Coach-Staging.");
