// Ensure changing the rule coach's tone cannot change the actual analysis.
// TypeScript is transpiled in memory so this test runs with `node --test`.
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

const defaultsSource = readFileSync(
  new URL("../lib/settings/defaults.ts", import.meta.url),
  "utf8",
);
const defaultsUrl = moduleUrl(transpile(defaultsSource));
const preferencesSource = readFileSync(
  new URL("../lib/coach/preferences.ts", import.meta.url),
  "utf8",
).replace('from "../settings/defaults"', `from "${defaultsUrl}"`);
const { shapeReportForPreferences } = await import(
  moduleUrl(transpile(preferencesSource))
);

const baseReport = {
  headline: "One avoidable click decided this game.",
  summary: "You cleared 69% of the safe squares before hitting a mine.",
  grade: "C",
  score: 55,
  metrics: { logicalReveals: 10, reveals: 12, guesses: 2 },
  notes: ["The board was replayed from recorded moves."],
  keyMoment: { moveNumber: 19, row: 6, col: 1 },
  strengths: [
    "Ten reveals were logically safe.",
    "All six flags were correct.",
    "Good opening.",
  ],
  improvements: [
    "Five safe squares remained.",
    "Avoid unnecessary guesses.",
    "Review chording.",
  ],
  nextSteps: [
    "Check guaranteed safe moves first.",
    "Try chording.",
    "Practice patterns.",
  ],
};
const preferences = (coachingStyle, explanationDetail = "standard") => ({
  coachingStyle,
  explanationDetail,
});

test("encouraging, balanced, and direct have visibly different text", () => {
  const reports = ["encouraging", "balanced", "direct"].map((style) =>
    shapeReportForPreferences(baseReport, preferences(style)),
  );
  assert.equal(new Set(reports.map((report) => report.summary)).size, 3);
  assert.match(reports[0].summary, /build on/);
  assert.equal(reports[1].summary, baseReport.summary);
  assert.match(reports[2].summary, /Bottom line:/);
});

test("styles preserve every game fact and original finding", () => {
  for (const style of ["encouraging", "balanced", "direct"]) {
    const shaped = shapeReportForPreferences(baseReport, preferences(style));
    for (const field of ["headline", "grade", "score", "metrics", "notes", "keyMoment"]) {
      assert.deepEqual(shaped[field], baseReport[field]);
    }
    for (const field of ["strengths", "improvements", "nextSteps"]) {
      assert.equal(shaped[field].length, baseReport[field].length);
      shaped[field].forEach((line, index) =>
        assert.ok(line.includes(baseReport[field][index])),
      );
    }
    assert.ok(shaped.summary.includes(baseReport.summary));
  }
  assert.equal(
    baseReport.summary,
    "You cleared 69% of the safe squares before hitting a mine.",
  );
});

test("brief detail still limits bullet lists to two for every style", () => {
  for (const style of ["encouraging", "balanced", "direct"]) {
    const shaped = shapeReportForPreferences(baseReport, preferences(style, "brief"));
    assert.equal(shaped.strengths.length, 2);
    assert.equal(shaped.improvements.length, 2);
    assert.equal(shaped.nextSteps.length, 2);
    assert.equal(shaped.score, baseReport.score);
  }
});
