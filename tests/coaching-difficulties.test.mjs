// Regression coverage for rectangular Minesweeper coaching boards.
// Load TypeScript helpers in memory, keeping this test compatible with node --test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function compiledModule(path, replacements = []) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [before, after] of replacements) {
    assert.ok(source.includes(before), `Expected import not found in ${path}`);
    source = source.replace(before, after);
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return moduleUrl(compiled);
}

const defaultsUrl = compiledModule("../lib/settings/defaults.ts");
const preferencesUrl = compiledModule("../lib/coach/preferences.ts", [
  ['from "../settings/defaults"', `from "${defaultsUrl}"`],
]);
const boardUrl = compiledModule("../lib/coach/board.ts");
const validationUrl = compiledModule("../lib/coach/validate.ts", [
  ['from "./board"', `from "${boardUrl}"`],
  ['from "./preferences"', `from "${preferencesUrl}"`],
]);
const analysisUrl = compiledModule("../lib/coach/analyze.ts", [
  ['from "./board"', `from "${boardUrl}"`],
]);
const gameSettingsUrl = compiledModule("../lib/game-settings.ts");

const { boardShapeOf, indexOf, rowOf, colOf, neighboursOf, openingCellOf } = await import(
  boardUrl
);
const { validateSession } = await import(validationUrl);
const { analyzeGameplay } = await import(analysisUrl);
const { DIFFICULTY_SETTINGS } = await import(gameSettingsUrl);

function recordedGame(settings) {
  const { rows, columns, mines, label } = settings;
  return {
    game: "minesweeper",
    difficulty: label,
    rows,
    columns,
    mineCount: mines,
    outcome: "loss",
    mines: Array.from({ length: mines }, (_, i) => i),
    moves: [{ row: rows - 1, col: columns - 1, action: "reveal", atMs: 1200 }],
  };
}

for (const [difficulty, expected] of [
  ["beginner", [9, 9, 10]],
  ["intermediate", [16, 16, 40]],
  ["expert", [16, 30, 99]],
]) {
  test(`${difficulty} dimensions validate and replay in the coaching engine`, () => {
    const settings = DIFFICULTY_SETTINGS[difficulty];
    assert.deepEqual([settings.rows, settings.columns, settings.mines], expected);
    assert.deepEqual(boardShapeOf(settings), {
      rows: settings.rows,
      columns: settings.columns,
    });

    const parsed = validateSession(recordedGame(settings));
    assert.ok("session" in parsed, JSON.stringify(parsed));
    assert.equal(parsed.session.rows, settings.rows);
    assert.equal(parsed.session.columns, settings.columns);
    assert.equal(parsed.session.mines.length, settings.mines);

    const report = analyzeGameplay(parsed.session);
    assert.equal(report.metrics.totalMoves, 1);
    assert.equal(report.metrics.openingCell, "corner");
    assert.ok(Number.isFinite(report.score));
    assert.ok(report.notes.some((note) => note.includes("recorded mine layout")));
  });
}

test("Expert board uses 30 columns when converting indices and finding neighbours", () => {
  assert.equal(indexOf(1, 0, 30), 30);
  assert.equal(rowOf(29, 30), 0);
  assert.equal(colOf(29, 30), 29);
  assert.deepEqual(
    neighboursOf(29, 16, 30).sort((a, b) => a - b),
    [28, 58, 59],
  );
  assert.deepEqual(
    neighboursOf(30, 16, 30).sort((a, b) => a - b),
    [0, 1, 31, 60, 61],
  );
  assert.equal(openingCellOf(0, 29, 16, 30), "corner");
  assert.equal(openingCellOf(7, 29, 16, 30), "edge");
  assert.equal(openingCellOf(7, 14, 16, 30), "center");
});

test("legacy square boardSize is still accepted and normalized", () => {
  const {
    rows: _rows,
    columns: _columns,
    ...oldGame
  } = recordedGame(DIFFICULTY_SETTINGS.beginner);
  const parsed = validateSession({ ...oldGame, boardSize: 9 });
  assert.ok("session" in parsed, JSON.stringify(parsed));
  assert.equal(parsed.session.rows, 9);
  assert.equal(parsed.session.columns, 9);
});

test("API validation rejects Expert coordinates, mine indices and square shorthand that do not fit", () => {
  const expert = recordedGame(DIFFICULTY_SETTINGS.expert);
  const invalidSessions = [
    { ...expert, moves: [{ row: 16, col: 0, action: "reveal" }] },
    { ...expert, moves: [{ row: 0, col: 30, action: "reveal" }] },
    { ...expert, mines: [...expert.mines.slice(0, -1), 480] },
    { ...expert, boardSize: 16 },
  ];
  for (const invalid of invalidSessions) {
    const parsed = validateSession(invalid);
    assert.ok(
      "error" in parsed,
      `Invalid board was accepted: ${JSON.stringify(invalid)}`,
    );
  }
});
