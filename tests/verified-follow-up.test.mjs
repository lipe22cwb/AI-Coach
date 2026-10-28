import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceReport } from "../lib/coach/evidence-report.ts";
import {
  answerVerifiedFollowUp,
  classifyVerifiedQuestion,
} from "../lib/coach/verified-follow-up.ts";

const game = {
  rows: 2,
  columns: 3,
  mineCount: 2,
  mines: [0, 2],
  moves: [
    { row: 1, col: 0, action: "reveal" },
    { row: 1, col: 1, action: "reveal" },
    { row: 1, col: 2, action: "reveal" },
    { row: 0, col: 1, action: "flag" },
    { row: 0, col: 1, action: "unflag" },
    { row: 0, col: 0, action: "flag" },
  ],
};

const report = buildEvidenceReport(game);
const moment = report.moments[0];

test("verified example includes a real coaching moment", () => {
  assert.ok(moment);
  assert.match(moment.id, /^move-\d+$/);
});

test("why question returns exact selected move and verified evidence", () => {
  const result = answerVerifiedFollowUp(
    report,
    moment.id,
    "Why was this decision classified this way?",
  );
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.answer.moveNumber, moment.moveNumber);
  assert.equal(result.answer.intent, "why");
  assert.ok(result.answer.paragraphs.some((part) => part.includes(moment.evidence)));
  assert.ok(result.answer.paragraphs.some((part) => part.includes(moment.finding)));
});

test("evidence question uses visible-board proof without mine layout", () => {
  const result = answerVerifiedFollowUp(
    report,
    moment.id,
    "What did the visible board prove?",
  );
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.answer.intent, "evidence");
  assert.match(result.answer.paragraphs.join(" "), /visible before that move/);
  assert.ok(result.answer.paragraphs.some((part) => part.includes(moment.evidence)));
});

test("next step question echoes approved deterministic advice", () => {
  const result = answerVerifiedFollowUp(
    report,
    moment.id,
    "What should I try next time?",
  );
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.answer.intent, "next");
  assert.ok(result.answer.paragraphs.includes(moment.nextTime));
});

test("freeform variations of why, evidence, and next time work", () => {
  assert.equal(classifyVerifiedQuestion("Can you explain this decision?"), "why");
  assert.equal(
    classifyVerifiedQuestion("How did you know this was guaranteed safe?"),
    "evidence",
  );
  assert.equal(classifyVerifiedQuestion("How can I improve my strategy?"), "next");
});

test("a fabricated move cannot be queried", () => {
  const result = answerVerifiedFollowUp(report, "move-999", "Why was this a mistake?");
  assert.equal(result.supported, false);
});

test("unsupported hypotheticals do not produce invented answers", () => {
  assert.equal(
    answerVerifiedFollowUp(report, moment.id, "What if I had clicked somewhere else?")
      .supported,
    false,
  );
  assert.equal(
    answerVerifiedFollowUp(report, moment.id, "Would I have won?").supported,
    false,
  );
});

test("unrelated or ambiguous questions are not pretended to be supported", () => {
  assert.equal(
    answerVerifiedFollowUp(report, moment.id, "Who is the best player in the world?")
      .supported,
    false,
  );
  assert.equal(answerVerifiedFollowUp(report, moment.id, "Hi").supported, false);
});

test("no moments means no follow-up answer is invented", () => {
  const empty = buildEvidenceReport({
    rows: 3,
    columns: 3,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 1, action: "reveal" },
      { row: 0, col: 0, action: "reveal" },
    ],
    outcome: "loss",
  });
  assert.equal(empty.moments.length, 0);
  assert.equal(
    answerVerifiedFollowUp(empty, "move-1", "Why was this a mistake?").supported,
    false,
  );
});

test("output stays specific to selected group and mentions its move number", () => {
  for (const selected of report.moments) {
    const result = answerVerifiedFollowUp(
      report,
      selected.id,
      "Why was this decision classified this way?",
    );
    assert.equal(result.supported, true);
    if (!result.supported) continue;
    assert.ok(result.answer.paragraphs.join(" ").includes(`Move ${selected.moveNumber}`));
    assert.ok(result.answer.paragraphs.join(" ").includes(selected.location));
  }
});

test("a 240-character question is permitted but longer ones are not", () => {
  assert.equal(classifyVerifiedQuestion("why " + "a".repeat(237)), null);
  assert.equal(classifyVerifiedQuestion("why " + "a".repeat(236)), "why");
});
