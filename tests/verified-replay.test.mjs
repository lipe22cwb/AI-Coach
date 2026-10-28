import test from "node:test";
import assert from "node:assert/strict";

import { deduceVisibleBoard, replayRecordedGame } from "../lib/coach/verified-replay.ts";

function makeVisible(
  rows,
  columns,
  minePositions,
  revealedPositions,
  flaggedPositions = [],
) {
  const mines = new Set(minePositions);
  const shown = new Set(revealedPositions);
  const flags = new Set(flaggedPositions);
  const result = Array.from({ length: rows * columns }, (_, i) => ({
    revealed: shown.has(i),
    flagged: flags.has(i),
    exploded: false,
    adjacentMines: null,
  }));
  for (let i = 0; i < result.length; i += 1) {
    if (!shown.has(i)) continue;
    assert.equal(mines.has(i), false, "A revealed test square cannot be a mine");
    const r = Math.floor(i / columns);
    const c = i % columns;
    let count = 0;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr,
          nc = c + dc;
        if (
          nr >= 0 &&
          nr < rows &&
          nc >= 0 &&
          nc < columns &&
          mines.has(nr * columns + nc)
        )
          count += 1;
      }
    }
    result[i].adjacentMines = count;
  }
  return result;
}

// Independent brute-force oracle: enumerate every mine layout compatible with
// the visible numbers and public mine count. This is intentionally separate
// from the rule/subset implementation and gives us a soundness check.
function oracle(rows, columns, mineCount, cells) {
  const total = rows * columns;
  const covered = Array.from({ length: total }, (_, i) => i).filter(
    (i) => !cells[i].revealed,
  );
  const possible = [];
  const knownNumbers = cells.map((v, i) => ({ ...v, i })).filter((v) => v.revealed);
  function valid(candidate) {
    for (const { i, adjacentMines } of knownNumbers) {
      const r = Math.floor(i / columns),
        c = i % columns;
      let count = 0;
      for (const m of candidate) {
        const mr = Math.floor(m / columns),
          mc = m % columns;
        if (Math.abs(mr - r) <= 1 && Math.abs(mc - c) <= 1) count++;
      }
      if (count !== adjacentMines) return false;
    }
    return true;
  }
  function choose(start, selected) {
    if (selected.length === mineCount) {
      if (valid(selected)) possible.push(new Set(selected));
      return;
    }
    for (
      let pos = start;
      pos <= covered.length - (mineCount - selected.length);
      pos += 1
    ) {
      choose(pos + 1, [...selected, covered[pos]]);
    }
  }
  choose(0, []);
  assert.ok(possible.length > 0, "A valid known board must admit its true mine layout");
  const safe = new Set(),
    mines = new Set();
  for (const index of covered) {
    if (possible.every((layout) => layout.has(index))) mines.add(index);
    if (possible.every((layout) => !layout.has(index))) safe.add(index);
  }
  return { safe, mines };
}

// Twenty-five deterministic, distinct, valid known-board situations. The
// independent exhaustive solver must agree with every *claimed* proof.
for (let seed = 1; seed <= 25; seed += 1) {
  test(`known board situation ${String(seed).padStart(2, "0")}: all proofs are sound`, () => {
    const rows = seed % 3 === 0 ? 4 : 3;
    const columns = seed % 4 === 0 ? 4 : 3;
    const total = rows * columns;
    const mineCount = 1 + (seed % 3);
    const shuffled = Array.from({ length: total }, (_, i) => i);
    let state = seed * 173 + 19;
    for (let i = total - 1; i > 0; i -= 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const j = state % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const mines = shuffled.slice(0, mineCount);
    // Only reveal numbered cells here. A zero would automatically expand
    // during actual play, so hiding its neighbors would be an impossible state.
    const numbered = shuffled.slice(mineCount).filter((index) => {
      const r = Math.floor(index / columns),
        c = index % columns;
      return mines.some(
        (mine) =>
          Math.abs(Math.floor(mine / columns) - r) <= 1 &&
          Math.abs((mine % columns) - c) <= 1,
      );
    });
    const revealed = numbered.slice(0, 1 + (seed % 5));
    const cells = makeVisible(rows, columns, mines, revealed);
    const reference = oracle(rows, columns, mineCount, cells);
    const actual = deduceVisibleBoard(rows, columns, mineCount, cells);
    for (const proof of actual.safe)
      assert.equal(reference.safe.has(proof.index), true, `Unsafe claim: ${proof.index}`);
    for (const proof of actual.mines)
      assert.equal(
        reference.mines.has(proof.index),
        true,
        `Incorrect mine claim: ${proof.index}`,
      );
    assert.ok(actual.safe.every((p) => !actual.mines.some((q) => p.index === q.index)));
  });
}

test("1-2-1 pattern: infer the middle safe and both ends mined", () => {
  const cells = makeVisible(2, 3, [0, 2], [3, 4, 5]);
  const result = deduceVisibleBoard(2, 3, 2, cells);
  assert.deepEqual(result.safe.map((x) => x.index).sort(), [1]);
  assert.deepEqual(result.mines.map((x) => x.index).sort(), [0, 2]);
});

test("1-2-2-1 pattern: inner two covered squares are mines", () => {
  const cells = makeVisible(2, 4, [1, 2], [4, 5, 6, 7]);
  const result = deduceVisibleBoard(2, 4, 2, cells);
  assert.deepEqual(result.safe.map((x) => x.index).sort(), [0, 3]);
  assert.deepEqual(result.mines.map((x) => x.index).sort(), [1, 2]);
});

test("An unsupported flag is never accepted as a proven mine", () => {
  const cells = makeVisible(2, 2, [0], [3], [1]);
  const result = deduceVisibleBoard(2, 2, 1, cells);
  assert.equal(result.safe.length, 0);
  assert.equal(result.mines.length, 0);
});

test("Global mine count can prove all covered squares safe", () => {
  const cells = makeVisible(2, 2, [], []);
  const result = deduceVisibleBoard(2, 2, 0, cells);
  assert.deepEqual(result.safe.map((p) => p.index).sort(), [0, 1, 2, 3]);
});

test("An unresolved choice is not falsely labelled a forced guess", () => {
  const game = {
    rows: 3,
    columns: 3,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 1, action: "reveal", atMs: 0 },
      { row: 0, col: 0, action: "reveal", atMs: 750 },
    ],
  };
  const result = replayRecordedGame(game);
  assert.equal(result.status, "lost");
  assert.equal(result.frames[1].decision, "not-enough-evidence");
  assert.equal(result.frames[1].after[0].exploded, true);
});

test("Replay supports rectangular boards and correct zero reveal propagation", () => {
  const result = replayRecordedGame({
    rows: 2,
    columns: 3,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 2, action: "reveal", atMs: 0 },
      { row: 1, col: 0, action: "reveal", atMs: 300 },
    ],
  });
  assert.equal(result.finalBoard.length, 6);
  assert.equal(result.status, "won");
  assert.equal(result.finalBoard.filter((c) => c.revealed).length, 5);
});

test("Flag and unflag are captured as separate visible board states", () => {
  const result = replayRecordedGame({
    rows: 3,
    columns: 3,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 1, action: "reveal" },
      { row: 0, col: 0, action: "flag" },
      { row: 0, col: 0, action: "unflag" },
    ],
  });
  assert.equal(result.frames[1].after[0].flagged, true);
  assert.equal(result.frames[2].after[0].flagged, false);
});

test("A chord can open multiple cells and complete a game", () => {
  const result = replayRecordedGame({
    rows: 2,
    columns: 2,
    mineCount: 1,
    mines: [0],
    moves: [
      { row: 1, col: 1, action: "reveal" },
      { row: 0, col: 0, action: "flag" },
      { row: 1, col: 1, action: "chord" },
    ],
  });
  assert.equal(result.status, "won");
  assert.equal(result.frames[2].after.filter((c) => c.revealed).length, 3);
});

test("Invalid recording fails closed instead of inventing an analysis", () => {
  assert.throws(() =>
    replayRecordedGame({ rows: 2, columns: 2, mineCount: 1, mines: [7], moves: [] }),
  );
});

test("Revealing a cell proven to contain a mine is a verified mistake", () => {
  const result = replayRecordedGame({
    rows: 2,
    columns: 3,
    mineCount: 2,
    mines: [0, 2],
    moves: [
      { row: 1, col: 0, action: "reveal" },
      { row: 1, col: 1, action: "reveal" },
      { row: 1, col: 2, action: "reveal" },
      { row: 0, col: 0, action: "reveal" },
    ],
  });
  const last = result.frames.at(-1);
  assert.equal(last?.decision, "mistake");
  assert.equal(last?.mistakeType, "revealed-known-mine");
  assert.equal(result.status, "lost");
});

test("Placing a flag on a proven-safe cell is a verified mistake", () => {
  const result = replayRecordedGame({
    rows: 2,
    columns: 3,
    mineCount: 2,
    mines: [0, 2],
    moves: [
      { row: 1, col: 0, action: "reveal" },
      { row: 1, col: 1, action: "reveal" },
      { row: 1, col: 2, action: "reveal" },
      { row: 0, col: 1, action: "flag" },
    ],
  });
  assert.equal(result.frames.at(-1)?.mistakeType, "flagged-known-safe");
  assert.equal(result.frames.at(-1)?.decision, "mistake");
});

test("Uncertain reveal with proven-safe alternatives is an unnecessary guess", () => {
  const result = replayRecordedGame({
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
  assert.equal(result.frames.at(-1)?.decision, "mistake");
  assert.equal(result.frames.at(-1)?.mistakeType, "unnecessary-guess");
  assert.ok((result.frames.at(-1)?.deductions.safe.length ?? 0) > 0);
});
