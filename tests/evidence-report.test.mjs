import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEvidenceReport,
  validateFocusSelection,
} from "../lib/coach/evidence-report.ts";

const base = (changes = {}) => ({
  rows: 2,
  columns: 3,
  mineCount: 2,
  mines: [0, 2],
  moves: [
    { row: 1, col: 0, action: "reveal" },
    { row: 1, col: 1, action: "reveal" },
    { row: 1, col: 2, action: "reveal" },
  ],
  ...changes,
});

test("No filler moments are generated when evidence is insufficient", () => {
  const game = {
    rows: 3,
    columns: 3,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 1, action: "reveal" },
      { row: 0, col: 0, action: "reveal" },
    ],
    outcome: "loss",
  };
  const report = buildEvidenceReport(game);
  assert.equal(report.moments.length, 0);
  assert.equal(report.verifiedMistakes, 0);
  assert.match(report.takeaway, /uncertain move is not automatically/i);
});

test("Revealing a provably mined cell generates a numbered, grounded coaching moment", () => {
  const report = buildEvidenceReport(
    base({
      outcome: "loss",
      moves: [...base().moves, { row: 0, col: 0, action: "reveal" }],
    }),
  );
  const moment = report.moments[0];
  assert.equal(moment.category, "Opened a proven mine");
  assert.equal(moment.moveNumber, 4);
  assert.equal(moment.id, "move-4");
  assert.match(moment.evidence, /row 1, column 1/i);
  assert.match(moment.nextTime, /check/i);
});

test("Flagging a proven safe cell is a verified mistake with supporting proof", () => {
  const report = buildEvidenceReport(
    base({ moves: [...base().moves, { row: 0, col: 1, action: "flag" }] }),
  );
  const moment = report.moments[0];
  assert.equal(moment.category, "Flagged a proven-safe square");
  assert.equal(moment.moveNumber, 4);
  assert.match(moment.evidence, /visible number|mine count|comparing/i);
});

test("An unnecessary guess cites a proved-safe alternative, not the hidden mine layout", () => {
  const report = buildEvidenceReport({
    rows: 2,
    columns: 5,
    mineCount: 3,
    mines: [0, 2, 4],
    moves: [
      { row: 1, col: 0, action: "reveal" },
      { row: 1, col: 1, action: "reveal" },
      { row: 1, col: 2, action: "reveal" },
      { row: 1, col: 4, action: "reveal" },
    ],
  });
  const moment = report.moments.find((x) => x.category === "Unnecessary guess");
  assert.ok(moment);
  assert.match(moment.evidence, /guaranteed safe/i);
  assert.match(moment.finding, /uncertain/i);
});

test("Repeat errors are grouped into one example with occurrence count", () => {
  const report = buildEvidenceReport(
    base({
      moves: [
        ...base().moves,
        { row: 0, col: 1, action: "flag" },
        { row: 0, col: 1, action: "unflag" },
        { row: 0, col: 1, action: "flag" },
      ],
    }),
  );
  const safeFlagMoments = report.moments.filter(
    (x) => x.category === "Flagged a proven-safe square",
  );
  assert.equal(safeFlagMoments.length, 1);
  assert.equal(safeFlagMoments[0].occurrences, 2);
});

test("Guaranteed safe and flagged mine are rewarded with exact evidence", () => {
  const report = buildEvidenceReport(
    base({
      moves: [
        ...base().moves,
        { row: 0, col: 0, action: "flag" },
        { row: 0, col: 1, action: "reveal" },
      ],
      outcome: "win",
    }),
  );
  const categories = report.moments.map((x) => x.category);
  assert.ok(categories.includes("Correct logical flag"));
  assert.ok(categories.includes("Guaranteed-safe reveal"));
  assert.equal(report.verifiedMistakes, 0);
});

test("The report is capped at five distinct categories and never invents placeholders", () => {
  const report = buildEvidenceReport(base());
  assert.ok(report.moments.length <= 5);
  assert.equal(
    new Set(report.moments.map((x) => x.category)).size,
    report.moments.length,
  );
});

test("Rectangular boards work and produce no square-only assumptions", () => {
  const report = buildEvidenceReport({
    rows: 2,
    columns: 3,
    mineCount: 1,
    mines: [0],
    outcome: "win",
    moves: [
      { row: 1, col: 2, action: "reveal" },
      { row: 1, col: 0, action: "reveal" },
    ],
  });
  assert.equal(report.recordedActions, 2);
});

test("Conflicting game outcome is rejected, not coached as fact", () => {
  assert.throws(
    () => buildEvidenceReport(base({ outcome: "win" })),
    /outcome does not match/,
  );
});

test("Invalid mine layouts never yield coaching text", () => {
  assert.throws(() => buildEvidenceReport(base({ mines: [0, 0] })), /invalid recorded/i);
});

test("AI cannot introduce an unverified move or made-up choice", () => {
  const report = buildEvidenceReport(
    base({ moves: [...base().moves, { row: 0, col: 1, action: "flag" }] }),
  );
  const verified = report.moments[0].id;
  assert.deepEqual(validateFocusSelection(report, verified, "step-by-step"), {
    focusId: verified,
    style: "step-by-step",
  });
  assert.equal(validateFocusSelection(report, "move-999", "direct"), null);
  assert.equal(validateFocusSelection(report, verified, "invented-style"), null);
});
