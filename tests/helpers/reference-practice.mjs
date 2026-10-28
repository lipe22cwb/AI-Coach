// A small independent model of the LIVE Practice board, built for Phase 7 tests.
// IMPORTANT: This deliberately does not import verified-replay.ts, the game UI,
// or the application's visible-board-hash.ts. Expected states and hashes are
// calculated separately, so a replay bug cannot simply approve itself.

import assert from "node:assert/strict";

export function neighbors(index, rows, columns) {
  const row = Math.floor(index / columns);
  const col = index % columns;
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < columns) result.push(r * columns + c);
    }
  }
  return result;
}

export function visibleHash(cells, rows, columns) {
  const tokens = cells.map((cell) => {
    if (!cell.revealed) return cell.flagged ? "F" : ".";
    return cell.mine || cell.exploded || cell.adjacentMines === null
      ? "M"
      : String(cell.adjacentMines);
  });
  const text = `${rows}x${columns}:${tokens.join("")}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function action(row, col, name) {
  return { row, col, action: name };
}

export function referenceGame({
  rows,
  columns,
  mines,
  actions,
  difficulty = "Beginner",
}) {
  const total = rows * columns;
  const mineSet = new Set(mines);
  assert.ok(rows >= 2 && columns >= 2 && mineSet.size === mines.length);
  assert.ok(mines.every((i) => i >= 0 && i < total));

  const cells = Array.from({ length: total }, (_, index) => ({
    mine: mineSet.has(index),
    flagged: false,
    revealed: false,
    exploded: false,
    adjacentMines: neighbors(index, rows, columns).filter((n) => mineSet.has(n)).length,
  }));
  const frames = [];
  let outcome = "playing";
  const reveal = (start) => {
    if (cells[start].mine) {
      for (const index of mineSet) cells[index].revealed = true;
      cells[start].exploded = true;
      outcome = "loss";
      return;
    }
    const queue = [start];
    const seen = new Set();
    while (queue.length) {
      const index = queue.shift();
      if (seen.has(index)) continue;
      seen.add(index);
      const cell = cells[index];
      if (cell.flagged || cell.revealed || cell.mine) continue;
      cell.revealed = true;
      if (cell.adjacentMines === 0) {
        for (const adjacent of neighbors(index, rows, columns)) {
          if (
            !cells[adjacent].flagged &&
            !cells[adjacent].revealed &&
            !cells[adjacent].mine
          ) {
            queue.push(adjacent);
          }
        }
      }
    }
  };

  for (let index = 0; index < actions.length; index++) {
    const move = actions[index];
    assert.equal(
      outcome,
      "playing",
      `Fixture tried to act after game ended at ${index + 1}`,
    );
    const selected = move.row * columns + move.col;
    assert.ok(selected >= 0 && selected < total, "Fixture move out of board bounds");
    const target = cells[selected];
    const before = cells.map((cell) => ({ ...cell }));
    if (move.action === "flag") {
      assert.equal(target.revealed || target.flagged, false, "Invalid reference flag");
      assert.ok(cells.filter((cell) => cell.flagged).length < mineSet.size);
      target.flagged = true;
    } else if (move.action === "unflag") {
      assert.equal(target.flagged, true, "Invalid reference unflag");
      target.flagged = false;
    } else if (move.action === "reveal") {
      assert.equal(target.revealed || target.flagged, false, "Invalid reference reveal");
      reveal(selected);
    } else if (move.action === "chord") {
      assert.equal(target.revealed, true, "Chord requires a revealed number");
      const adjacent = neighbors(selected, rows, columns);
      const flags = adjacent.filter((i) => cells[i].flagged).length;
      assert.ok(target.adjacentMines > 0 && flags === target.adjacentMines);
      const covered = adjacent.filter((i) => !cells[i].revealed && !cells[i].flagged);
      assert.ok(covered.length > 0);
      if (covered.some((i) => cells[i].mine)) {
        // On a failed live chord, every mine appears; safe squares stay covered.
        for (const i of mineSet) cells[i].revealed = true;
        cells[covered.find((i) => cells[i].mine)].exploded = true;
        outcome = "loss";
      } else {
        for (const i of covered) reveal(i);
      }
    } else {
      throw new Error(`Unknown reference action ${move.action}`);
    }
    if (
      outcome === "playing" &&
      cells.filter((c) => c.revealed && !c.mine).length === total - mineSet.size
    ) {
      outcome = "win";
    }
    const after = cells.map((cell) => ({ ...cell }));
    assert.notDeepEqual(before, after, `Fixture move ${index + 1} made no change`);
    frames.push({ before, after, hash: visibleHash(after, rows, columns), outcome });
  }

  const durationSeconds = Math.max(1, actions.length);
  return {
    recording: {
      game: "minesweeper",
      difficulty,
      rows,
      columns,
      mineCount: mines.length,
      mines: [...mines],
      outcome,
      durationSeconds,
      moves: actions.map((move, i) => ({
        ...move,
        atMs: i * 1000,
        afterHash: frames[i].hash,
      })),
    },
    frames,
  };
}

export function seededWinningGame(seed, rows = 4, columns = 5) {
  let state = (seed * 1664525 + 1013904223) >>> 0;
  const next = (limit) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state % limit;
  };
  // First click at 0,0 is safe and there is at least one numbered section.
  const candidates = Array.from({ length: rows * columns }, (_, index) => index).filter(
    (index) => index !== 0 && (Math.floor(index / columns) > 1 || index % columns > 1),
  );
  const mines = [];
  const mineCount = Math.min(3, candidates.length);
  while (mines.length < mineCount) {
    const value = candidates[next(candidates.length)];
    if (!mines.includes(value)) mines.push(value);
  }

  // Build the game incrementally so all appended actions are real, changed
  // actions; a zero cascade may have already revealed nearby cells.
  let actions = [action(0, 0, "reveal")];
  let current = referenceGame({ rows, columns, mines, actions });
  if (current.recording.outcome === "win") return current;

  // Use a temporary correct flag and remove it, testing both recording events.
  const mineIndex = mines[0];
  const mr = Math.floor(mineIndex / columns);
  const mc = mineIndex % columns;
  actions.push(action(mr, mc, "flag"), action(mr, mc, "unflag"));
  current = referenceGame({ rows, columns, mines, actions });

  const nonMines = Array.from({ length: rows * columns }, (_, i) => i).filter(
    (i) => !mines.includes(i),
  );
  // Deterministic but different order across seeds, to exercise more paths.
  const order = seed % 2 ? nonMines.slice().reverse() : nonMines;
  for (const index of order) {
    if (current.recording.outcome !== "playing") break;
    const cell = current.frames.at(-1).after[index];
    if (cell.revealed || cell.flagged) continue;
    actions.push(action(Math.floor(index / columns), index % columns, "reveal"));
    current = referenceGame({ rows, columns, mines, actions });
  }
  assert.equal(current.recording.outcome, "win");
  return current;
}

// Exhaustive independent oracle for small visible boards. A flagged cell is
// still unknown: flags are user annotations, never accepted as proven mines.
export function exhaustiveOracle(rows, columns, mineCount, visibleCells) {
  const covered = visibleCells
    .map((cell, i) => (!cell.revealed ? i : -1))
    .filter((i) => i >= 0);
  const numbered = visibleCells
    .map((cell, i) => ({ ...cell, index: i }))
    .filter((cell) => cell.revealed && !cell.exploded && cell.adjacentMines !== null);
  const possible = [];
  const choose = (start, selected) => {
    if (selected.length === mineCount) {
      const mines = new Set(selected);
      if (
        numbered.every(
          (cell) =>
            neighbors(cell.index, rows, columns).filter((i) => mines.has(i)).length ===
            cell.adjacentMines,
        )
      )
        possible.push(mines);
      return;
    }
    for (let i = start; i <= covered.length - (mineCount - selected.length); i++) {
      choose(i + 1, [...selected, covered[i]]);
    }
  };
  choose(0, []);
  assert.ok(possible.length > 0, "Visible test state has no legal mine layout");
  const safe = new Set();
  const mines = new Set();
  for (const index of covered) {
    if (possible.every((layout) => !layout.has(index))) safe.add(index);
    if (possible.every((layout) => layout.has(index))) mines.add(index);
  }
  return { safe, mines };
}
