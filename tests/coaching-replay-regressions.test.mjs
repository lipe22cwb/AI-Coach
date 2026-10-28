// Diagnostic tests for deterministic coaching replay.
// These intentionally capture the correct game behavior. Some may FAIL on the
// current implementation: keep this on a separate branch until the fix lands.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const boardUrl = moduleUrl(
  transpile(readFileSync(new URL("../lib/coach/board.ts", import.meta.url), "utf8")),
);
const analysisSource = readFileSync(
  new URL("../lib/coach/analyze.ts", import.meta.url),
  "utf8",
).replace('from "./board"', `from "${boardUrl}"`);
const { analyzeGameplay } = await import(moduleUrl(transpile(analysisSource)));

const reveal = (row, col) => ({ row, col, action: "reveal" });
const flag = (row, col) => ({ row, col, action: "flag" });
const chord = (row, col) => ({ row, col, action: "chord" });

// The 2x2 board contains a single mine at row 0, column 1.
// Revealing row 0, column 0 shows "1"; it does not identify WHICH neighbour
// holds the mine. A correct flag placed by luck is not proof.
function game(moves, outcome = "in-progress") {
  return {
    game: "minesweeper",
    difficulty: "Test",
    rows: 2,
    columns: 2,
    mineCount: 1,
    mines: [1],
    outcome,
    moves,
  };
}

function progressNote(result) {
  return result.notes.find((line) => line.startsWith("You cleared "));
}

test("a lucky correct flag does not prove other covered squares safe", () => {
  const result = analyzeGameplay(game([reveal(0, 0), flag(0, 1), reveal(1, 0)]));
  assert.equal(
    result.metrics?.logicalReveals,
    0,
    "No visible clue proved the flag correct, so the next reveal was not guaranteed",
  );
});

test("valid chord with matching flags and covered neighbours is replayed", () => {
  const result = analyzeGameplay(game([reveal(0, 0), flag(0, 1), chord(0, 0)], "win"));
  assert.equal(result.metrics?.chords, 1);
  assert.equal(result.keyMoment?.row ?? null, null);
});

test("chord without enough flags does not fire", () => {
  const result = analyzeGameplay(game([reveal(0, 0), chord(0, 0)]));
  assert.equal(result.metrics?.chords, 0);
});

test("chord with no covered neighbours is not a performed action", () => {
  const result = analyzeGameplay(
    game([reveal(0, 0), flag(0, 1), reveal(1, 0), reveal(1, 1), chord(0, 0)]),
  );
  assert.equal(result.metrics?.chords, 0);
});

test("a lethal wrong-flag chord does not reveal safe neighbours", () => {
  const result = analyzeGameplay(game([reveal(0, 0), flag(1, 0), chord(0, 0)], "loss"));
  assert.match(progressNote(result) ?? "", /1 of 3 safe squares/);
  assert.equal(result.keyMoment?.row, 0);
  assert.equal(result.keyMoment?.col, 1);
});

test("moves recorded after hitting a mine must not change replay", () => {
  const result = analyzeGameplay(
    game([reveal(0, 0), reveal(0, 1), reveal(1, 0)], "loss"),
  );
  assert.match(progressNote(result) ?? "", /1 of 3 safe squares/);
});
