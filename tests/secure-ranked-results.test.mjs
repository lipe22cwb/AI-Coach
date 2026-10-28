import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRankedBoardQuery,
  serializeVerifiedResults,
} from "../lib/ranked/verified-results.ts";
import {
  parseRankedResultInput,
  saveRankedResult,
  listRankedResults,
} from "../lib/ranked-results.ts";

const query = (text) => parseRankedBoardQuery(new URLSearchParams(text));
const win = {
  gameId: "some-fake-game-123",
  playerName: "Fake Player",
  boardSize: 16,
  mineCount: 40,
  durationMs: 1,
  outcome: "win",
};

test("current Intermediate board query is accepted", () => {
  assert.deepEqual(query("boardSize=16&mineCount=40"), { ok: true });
});

test("other boards and missing query options are rejected", () => {
  for (const q of [
    "",
    "boardSize=16",
    "boardSize=9&mineCount=40",
    "boardSize=16&mineCount=10",
    "boardSize=016&mineCount=40",
  ]) {
    assert.equal(query(q).ok, false, q);
  }
});

test("duplicate or unexpected query parameters are rejected", () => {
  assert.equal(query("boardSize=16&mineCount=40&boardSize=16").ok, false);
  assert.equal(query("boardSize=16&mineCount=40&debug=1").ok, false);
});

test("trusted rows are projected into public rank, time, finish only", () => {
  const input = [
    {
      duration_ms: 51000,
      finished_at: "2026-10-28T02:05:00Z",
      user_id: "secret-user",
      match_id: "secret-match",
    },
    {
      duration_ms: 62000,
      finished_at: "2026-10-28T02:10:00Z",
      email: "secret@example.com",
    },
  ];
  const result = serializeVerifiedResults(input);
  assert.deepEqual(result, [
    { rank: 1, durationMs: 51000, finishedAt: "2026-10-28T02:05:00Z" },
    { rank: 2, durationMs: 62000, finishedAt: "2026-10-28T02:10:00Z" },
  ]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("empty verified leaderboard is valid but absent data is not", () => {
  assert.deepEqual(serializeVerifiedResults([]), []);
  assert.throws(() => serializeVerifiedResults(null), /Invalid verified leaderboard/);
});

test("invalid, fake and negative durations cannot be published", () => {
  for (const duration of [-1, 0, "4", 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () =>
        serializeVerifiedResults([
          { duration_ms: duration, finished_at: "2026-10-28T02:05:00Z" },
        ]),
      /Invalid verified result duration/,
    );
  }
});

test("invalid timestamps, unsorted results and oversized lists are rejected", () => {
  assert.throws(
    () => serializeVerifiedResults([{ duration_ms: 100, finished_at: "not-a-date" }]),
    /Invalid verified result/,
  );
  assert.throws(
    () =>
      serializeVerifiedResults([
        { duration_ms: 200, finished_at: "2026-10-28T02:05:00Z" },
        { duration_ms: 100, finished_at: "2026-10-28T02:06:00Z" },
      ]),
    /not sorted/,
  );
  assert.throws(
    () =>
      serializeVerifiedResults(
        Array(51).fill({ duration_ms: 100, finished_at: "2026-10-28T02:06:00Z" }),
      ),
    /Invalid verified leaderboard/,
  );
});

test("legacy result input cannot validate a forged win", () => {
  assert.deepEqual(parseRankedResultInput(win).ok, false);
});

test("legacy write helper refuses even well-formed fabricated results", async () => {
  await assert.rejects(saveRankedResult(win), /disabled/);
});

test("legacy file-based leaderboard helper is disabled", async () => {
  await assert.rejects(listRankedResults(16, 40), /disabled/);
});
