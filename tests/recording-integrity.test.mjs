import assert from "node:assert/strict";
import test from "node:test";

import { visibleBoardHash, visibleReplayHash } from "../lib/coach/visible-board-hash.ts";
import { replayRecordedGame } from "../lib/coach/verified-replay.ts";
import { buildEvidenceReport } from "../lib/coach/evidence-report.ts";

function board(rows, columns, mines) {
  const set = new Set(mines);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => {
      let adjacentMines = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr || dc) {
            const rr = r + dr;
            const cc = c + dc;
            if (
              rr >= 0 &&
              rr < rows &&
              cc >= 0 &&
              cc < columns &&
              set.has(rr * columns + cc)
            ) {
              adjacentMines++;
            }
          }
        }
      }
      return {
        mine: set.has(r * columns + c),
        revealed: false,
        flagged: false,
        adjacentMines,
      };
    }),
  );
}

function around(row, col, rows, columns) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = row + dr;
      const cc = col + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < columns) result.push([rr, cc]);
    }
  }
  return result;
}

// Standalone adaptation of the actual Practice board's action rules. It does
// not use the replay engine or its board representation to calculate hashes.
function simulateLive(rows, columns, mines, actions) {
  const live = board(rows, columns, mines);
  let outcome = "playing";
  const stamps = [];
  function revealArea(starts) {
    const queue = [...starts];
    const seen = new Set();
    while (queue.length) {
      const [r, c] = queue.shift();
      const index = r * columns + c;
      if (seen.has(index)) continue;
      seen.add(index);
      const cell = live[r][c];
      if (cell.flagged || cell.mine || cell.revealed) continue;
      cell.revealed = true;
      if (cell.adjacentMines === 0) {
        for (const [nr, nc] of around(r, c, rows, columns)) {
          const next = live[nr][nc];
          if (!next.revealed && !next.flagged && !next.mine) queue.push([nr, nc]);
        }
      }
    }
  }
  for (const move of actions) {
    assert.equal(outcome, "playing", "Fixtures must not act after game over");
    const { row, col, action } = move;
    const cell = live[row][col];
    if (action === "flag" || action === "unflag") {
      assert.equal(cell.revealed, false);
      assert.equal(cell.flagged, action === "unflag");
      cell.flagged = action === "flag";
    } else if (action === "reveal") {
      assert.equal(cell.revealed || cell.flagged, false);
      if (cell.mine) {
        for (const line of live)
          for (const item of line) if (item.mine) item.revealed = true;
        outcome = "lost";
      } else revealArea([[row, col]]);
    } else if (action === "chord") {
      assert.equal(cell.revealed, true);
      const neighbours = around(row, col, rows, columns);
      const flagCount = neighbours.filter(([r, c]) => live[r][c].flagged).length;
      assert.equal(flagCount, cell.adjacentMines);
      const targets = neighbours.filter(
        ([r, c]) => !live[r][c].revealed && !live[r][c].flagged,
      );
      assert.ok(targets.length > 0);
      if (targets.some(([r, c]) => live[r][c].mine)) {
        for (const line of live)
          for (const item of line) if (item.mine) item.revealed = true;
        outcome = "lost";
      } else revealArea(targets);
    }
    if (outcome === "playing") {
      const revealedSafe = live.flat().filter((c) => c.revealed && !c.mine).length;
      if (revealedSafe === rows * columns - mines.length) outcome = "won";
    }
    stamps.push(visibleBoardHash(live));
  }
  return { stamps, outcome, live };
}

function checkedRecording(rows, columns, mines, actions) {
  const reference = simulateLive(rows, columns, mines, actions);
  return {
    reference,
    recording: {
      rows,
      columns,
      mineCount: mines.length,
      mines,
      moves: actions.map((move, i) => ({
        ...move,
        atMs: i * 400,
        afterHash: reference.stamps[i],
      })),
    },
  };
}

const m = (r, c, action) => ({ row: r, col: c, action });

test("blank board hash ignores hidden mines and includes dimensions", () => {
  const a = board(3, 3, [0]);
  const b = board(3, 3, [8]);
  assert.equal(visibleBoardHash(a), visibleBoardHash(b));
  assert.notEqual(visibleBoardHash(a), visibleBoardHash(board(3, 4, [0])));
});

test("the same visible board hashes identically in live and replay representations", () => {
  const live = board(2, 3, [0]);
  live[0][0].revealed = true;
  live[1][2].flagged = true;
  const flat = live.flat().map((cell) => ({
    revealed: cell.revealed,
    flagged: cell.flagged,
    exploded: false,
    adjacentMines: cell.revealed && !cell.mine ? cell.adjacentMines : null,
  }));
  assert.equal(visibleBoardHash(live), visibleReplayHash(flat, 2, 3));
});

test("live flag/unflag sequence matches every replay checkpoint", () => {
  const { recording, reference } = checkedRecording(
    3,
    3,
    [0],
    [m(1, 1, "reveal"), m(0, 0, "flag"), m(0, 0, "unflag"), m(0, 0, "flag")],
  );
  const replay = replayRecordedGame(recording);
  assert.equal(replay.frames.length, 4);
  assert.equal(visibleReplayHash(replay.finalBoard, 3, 3), reference.stamps.at(-1));
});

test("zero-flood reveal on a rectangular board matches the live checksum", () => {
  const { recording, reference } = checkedRecording(2, 4, [0], [m(1, 3, "reveal")]);
  const replay = replayRecordedGame(recording);
  assert.equal(replay.status, reference.outcome);
  assert.equal(
    replay.frames[0].after.filter((cell) => cell.revealed).length,
    reference.live.flat().filter((cell) => cell.revealed).length,
  );
});

test("successful chord matches the live board state", () => {
  const { recording, reference } = checkedRecording(
    2,
    3,
    [0],
    [m(1, 1, "reveal"), m(0, 0, "flag"), m(1, 1, "chord")],
  );
  const replay = replayRecordedGame(recording);
  assert.equal(replay.status, reference.outcome);
  assert.equal(replay.status, "won");
});

test("failed chord exposes mines only, not nearby safe squares", () => {
  const { recording, reference } = checkedRecording(
    3,
    3,
    [0, 2],
    [m(1, 1, "reveal"), m(0, 1, "flag"), m(1, 0, "flag"), m(1, 1, "chord")],
  );
  const replay = replayRecordedGame(recording);
  assert.equal(replay.status, reference.outcome);
  assert.equal(replay.status, "lost");
  assert.equal(visibleReplayHash(replay.finalBoard, 3, 3), reference.stamps.at(-1));
  assert.equal(replay.finalBoard.filter((cell) => cell.revealed).length, 3);
});

test("loss by direct mine reveal matches the live board", () => {
  const { recording, reference } = checkedRecording(
    3,
    3,
    [0, 2],
    [m(1, 1, "reveal"), m(0, 0, "reveal")],
  );
  const replay = replayRecordedGame(recording);
  assert.equal(replay.status, "lost");
  assert.equal(visibleReplayHash(replay.finalBoard, 3, 3), reference.stamps.at(-1));
});

test("corrupt or stale board hashes block coaching instead of guessing", () => {
  const { recording } = checkedRecording(3, 3, [0], [m(1, 1, "reveal")]);
  const corrupt = structuredClone(recording);
  corrupt.moves[0].afterHash = "deadbeef";
  assert.throws(() => replayRecordedGame(corrupt), /Visible board mismatch after move 1/);
});

test("a swapped mine layout is detected from the player's visible board", () => {
  const { recording } = checkedRecording(3, 3, [0], [m(2, 2, "reveal")]);
  const changed = { ...recording, mines: [8] };
  assert.throws(() => replayRecordedGame(changed), /Visible board mismatch after move 1/);
});

test("timestamps cannot move backward", () => {
  const { recording } = checkedRecording(3, 3, [0], [m(1, 1, "reveal"), m(0, 0, "flag")]);
  recording.moves[1].atMs = -1;
  assert.throws(() => replayRecordedGame(recording), /timestamp at move 2/);
  recording.moves[1].atMs = 0;
  recording.moves[0].atMs = 12;
  assert.throws(() => replayRecordedGame(recording), /timestamp at move 2/);
});

test("actions after the game ended are rejected", () => {
  const { recording } = checkedRecording(
    2,
    3,
    [0],
    [m(1, 2, "reveal"), m(1, 0, "reveal")],
  );
  assert.equal(replayRecordedGame(recording).status, "won");
  const extra = { ...recording, moves: [...recording.moves, m(0, 0, "flag")] };
  assert.throws(() => replayRecordedGame(extra), /after the game ended/);
});

test("legacy recordings without hashes remain readable", () => {
  const { recording } = checkedRecording(3, 3, [0], [m(1, 1, "reveal")]);
  const legacy = {
    ...recording,
    moves: recording.moves.map(({ afterHash, ...rest }) => rest),
  };
  assert.equal(replayRecordedGame(legacy).frames.length, 1);
});

// Seeded cross-checks against a separate implementation of the live board.
// These cover more board shapes, zero cascades, flags, and early losses without
// relying on the replay implementation to invent expected board states.
for (let seed = 1; seed <= 20; seed++) {
  test(`seeded live-vs-replay recording ${String(seed).padStart(2, "0")}`, () => {
    let state = seed * 1723 + 57;
    const next = (limit) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % limit;
    };
    const rows = 5;
    const columns = seed % 3 === 0 ? 7 : 6;
    const mineCount = 4;
    const candidates = Array.from({ length: rows * columns }, (_, i) => i).filter(
      (i) => Math.floor(i / columns) > 1 || i % columns > 1,
    );
    const minePositions = [];
    while (minePositions.length < mineCount) {
      const chosen = candidates[next(candidates.length)];
      if (!minePositions.includes(chosen)) minePositions.push(chosen);
    }
    const actions = [m(0, 0, "reveal")];
    for (let turn = 0; turn < 24; turn++) {
      const { live, outcome } = simulateLive(rows, columns, minePositions, actions);
      if (outcome !== "playing") break;
      const covered = [];
      const flagged = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < columns; c++) {
          if (live[r][c].flagged) flagged.push([r, c]);
          else if (!live[r][c].revealed) covered.push([r, c]);
        }
      const choices = [];
      if (covered.length) choices.push("reveal");
      if (covered.length && flagged.length < mineCount) choices.push("flag");
      if (flagged.length) choices.push("unflag");
      if (!choices.length) break;
      const action = choices[next(choices.length)];
      const pickFrom = action === "unflag" ? flagged : covered;
      const [r, c] = pickFrom[next(pickFrom.length)];
      actions.push(m(r, c, action));
    }
    const { recording, reference } = checkedRecording(
      rows,
      columns,
      minePositions,
      actions,
    );
    const replay = replayRecordedGame(recording);
    assert.equal(replay.frames.length, actions.length);
    assert.equal(replay.status, reference.outcome);
    assert.equal(
      visibleReplayHash(replay.finalBoard, rows, columns),
      reference.stamps.at(-1),
    );
  });
}

test("an altered checkpoint prevents an evidence-based report", () => {
  const { recording } = checkedRecording(3, 3, [0], [m(1, 1, "reveal")]);
  recording.moves[0].afterHash = "deadbeef";
  assert.throws(() => buildEvidenceReport(recording), /Visible board mismatch/);
});
