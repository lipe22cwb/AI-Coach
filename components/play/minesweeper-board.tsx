"use client";

import { Bomb, Flag, FlagTriangleRight, Grid2X2, MousePointer2 } from "lucide-react";
import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DifficultySettings } from "@/lib/game-settings";
import type { GameCell } from "./board-fixture";
import { GameStats } from "./game-stats";

type GameStatus = "ready" | "playing" | "won" | "lost";
type InputMode = "reveal" | "flag";
type Position = [number, number];
type MinesweeperBoardProps = { settings: DifficultySettings };

const numberClasses: Record<number, string> = {
  1: "number-one",
  2: "number-two",
  3: "number-three",
  4: "number-four",
  5: "number-five",
  6: "number-six",
  7: "number-seven",
  8: "number-eight",
};

function emptyBoard(rows: number, columns: number): GameCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({
      mine: false,
      adjacentMines: 0,
      revealed: false,
      flagged: false,
    })),
  );
}

function getNeighbors(
  row: number,
  col: number,
  rows: number,
  columns: number,
): Position[] {
  const result: Position[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < columns) {
        result.push([nextRow, nextCol]);
      }
    }
  }
  return result;
}

function generateBoard(
  rows: number,
  columns: number,
  mines: number,
  safeRow: number,
  safeCol: number,
): GameCell[][] {
  const board = emptyBoard(rows, columns);
  let placed = 0;
  let maxAttempts = 1000; // Safety guard to prevent infinite loops

  while (placed < mines && maxAttempts > 0) {
    maxAttempts--;
    const row = Math.floor(Math.random() * rows);
    const col = Math.floor(Math.random() * columns);

    // 1. First-click safe zone check
    const inFirstClickSafeZone =
      Math.abs(row - safeRow) <= 1 && Math.abs(col - safeCol) <= 1;
    if (inFirstClickSafeZone || board[row][col].mine) continue;

    // 2. ANTI-CLUSTERING CHECK:
    // Count how many mines are already touching this candidate cell.
    // If it's already touching 3 or more mines, skip it to prevent massive density piles!
    const existingAdjacentMines = getNeighbors(row, col, rows, columns).filter(
      ([r, c]) => board[r][c].mine,
    ).length;

    // Allow placement if it's not overcrowded (you can tweak this number)
    if (existingAdjacentMines >= 3 && placed < mines * 0.8) {
      continue;
    }

    board[row][col].mine = true;
    placed++;
  }

  // Fallback: If safety limits blocked too many placements, fill the rest randomly
  while (placed < mines) {
    const row = Math.floor(Math.random() * rows);
    const col = Math.floor(Math.random() * columns);
    const inFirstClickSafeZone =
      Math.abs(row - safeRow) <= 1 && Math.abs(col - safeCol) <= 1;
    if (!inFirstClickSafeZone && !board[row][col].mine) {
      board[row][col].mine = true;
      placed++;
    }
  }

  // Recalculate adjacent numbers for all cells
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      board[row][col].adjacentMines = getNeighbors(row, col, rows, columns).filter(
        ([r, c]) => board[r][c].mine,
      ).length;
    }
  }

  return board;
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** Reveal a cell and, if it is zero, expand through adjacent empty cells and their numbered border. */
function revealArea(
  board: GameCell[][],
  starts: Position[],
  rows: number,
  columns: number,
) {
  const queue = [...starts];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const [row, col] = queue.shift()!;
    const key = `${row},${col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const cell = board[row][col];
    if (cell.flagged || cell.mine || cell.revealed) continue;
    cell.revealed = true;

    if (cell.adjacentMines === 0) {
      for (const [nextRow, nextCol] of getNeighbors(row, col, rows, columns)) {
        const neighbor = board[nextRow][nextCol];
        if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) {
          queue.push([nextRow, nextCol]);
        }
      }
    }
  }
}

export function MinesweeperBoard({ settings }: MinesweeperBoardProps) {
  const { rows, columns, mines } = settings;
  const [board, setBoard] = useState<GameCell[][]>(() => emptyBoard(rows, columns));
  const [status, setStatus] = useState<GameStatus>("ready");
  const [firstClick, setFirstClick] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("reveal");
  const [focusedCell, setFocusedCell] = useState({ row: 0, col: 0 });
  const cellRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flaggedCount = useMemo(
    () => board.flat().filter((cell) => cell.flagged).length,
    [board],
  );
  const gameOver = status === "won" || status === "lost";

  useEffect(() => {
    if (status !== "playing") return;
    const timer = window.setInterval(() => setElapsedSeconds((time) => time + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const newGame = useCallback(() => {
    setBoard(emptyBoard(rows, columns));
    setStatus("ready");
    setFirstClick(true);
    setElapsedSeconds(0);
    setInputMode("reveal");
  }, [rows, columns]);

  const toggleFlag = useCallback(
    (row: number, col: number) => {
      if (gameOver) return;
      setBoard((current) => {
        const cell = current[row][col];
        if (cell.revealed) return current;
        const currentFlagCount = current.flat().filter((item) => item.flagged).length;
        if (!cell.flagged && currentFlagCount >= mines) return current;
        const next = current.map((line) => line.map((item) => ({ ...item })));
        next[row][col].flagged = !next[row][col].flagged;
        return next;
      });
    },
    [gameOver, mines],
  );

  const finishIfWon = useCallback(
    (nextBoard: GameCell[][]) => {
      const revealedSafeCells = nextBoard
        .flat()
        .filter((cell) => cell.revealed && !cell.mine).length;
      if (revealedSafeCells === rows * columns - mines) setStatus("won");
      else setStatus("playing");
    },
    [columns, mines, rows],
  );

  const revealCell = useCallback(
    (row: number, col: number) => {
      if (gameOver) return;
      let working = board.map((line) => line.map((cell) => ({ ...cell })));
      if (working[row][col].revealed || working[row][col].flagged) return;

      if (firstClick) {
        const flags = working.map((line) => line.map((cell) => cell.flagged));
        working = generateBoard(rows, columns, mines, row, col);
        working = working.map((line, r) =>
          line.map((cell, c) => ({ ...cell, flagged: flags[r][c] })),
        );
        setFirstClick(false);
      }

      if (working[row][col].mine) {
        working[row][col].revealed = true;
        working = working.map((line) =>
          line.map((cell) => ({ ...cell, revealed: cell.revealed || cell.mine })),
        );
        setBoard(working);
        setStatus("lost");
        return;
      }

      revealArea(working, [[row, col]], rows, columns);
      setBoard(working);
      finishIfWon(working);
    },
    [board, columns, firstClick, finishIfWon, gameOver, mines, rows],
  );

  // Chording: if both mouse buttons are held on a revealed number (or the middle
  // mouse button is used), reveal all unflagged neighbors only when the adjacent
  // flag count exactly matches the number. A wrongly placed flag can still lose.
  const chordCell = useCallback(
    (row: number, col: number) => {
      if (gameOver) return;
      const target = board[row][col];
      if (!target.revealed || target.adjacentMines <= 0) return;

      const neighbors = getNeighbors(row, col, rows, columns);
      const adjacentFlags = neighbors.filter(([r, c]) => board[r][c].flagged).length;
      if (adjacentFlags !== target.adjacentMines) return;

      const working = board.map((line) => line.map((cell) => ({ ...cell })));
      const toReveal = neighbors.filter(
        ([r, c]) => !working[r][c].flagged && !working[r][c].revealed,
      );

      // If any unflagged neighbor is a mine, chording reveals it and ends the game.
      if (toReveal.some(([r, c]) => working[r][c].mine)) {
        for (const [r, c] of toReveal) {
          if (working[r][c].mine) working[r][c].revealed = true;
        }
        const lostBoard = working.map((line) =>
          line.map((cell) => ({
            ...cell,
            revealed: cell.revealed || cell.mine,
          })),
        );
        setBoard(lostBoard);
        setStatus("lost");
        return;
      }

      revealArea(working, toReveal, rows, columns);
      setBoard(working);
      finishIfWon(working);
    },
    [board, finishIfWon, gameOver, rows, columns],
  );

  const handleContextMenu = (
    event: MouseEvent<HTMLButtonElement>,
    row: number,
    col: number,
  ) => {
    event.preventDefault();
    if (board[row][col].revealed) return;
    toggleFlag(row, col);
  };

  const handleMouseDown = (
    event: MouseEvent<HTMLButtonElement>,
    row: number,
    col: number,
  ) => {
    // `buttons === 3` means left and right mouse buttons are both held.
    // `button === 1` also supports the usual middle-click chord shortcut.
    if (event.buttons === 3 || event.button === 1) {
      event.preventDefault();
      chordCell(row, col);
    }
  };

  const handleCellKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
  ) => {
    const movement: Record<string, Position> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const offset = movement[event.key];
    if (!offset) return;

    event.preventDefault();
    const nextRow = Math.max(0, Math.min(rows - 1, row + offset[0]));
    const nextCol = Math.max(0, Math.min(columns - 1, col + offset[1]));
    setFocusedCell({ row: nextRow, col: nextCol });
    cellRefs.current[nextRow * columns + nextCol]?.focus();
  };

  const boardStyle = {
    "--board-columns": columns,
    "--board-rows": rows,
    "--board-min-width": `${columns * 32 + (columns - 1) * 2 + 6}px`,
  } as CSSProperties;

  return (
    <section className="game-panel" aria-label={`${settings.label} Minesweeper game`}>
      <GameStats
        minesRemaining={mines - flaggedCount}
        totalMines={mines}
        elapsedTime={formatTime(elapsedSeconds)}
        onNewGame={newGame}
      />

      <div className="game-controls" role="group" aria-label="Cell action mode">
        <button
          type="button"
          className={inputMode === "reveal" ? "mode-button active" : "mode-button"}
          aria-pressed={inputMode === "reveal"}
          onClick={() => setInputMode("reveal")}
          disabled={gameOver}
        >
          <MousePointer2 size={15} aria-hidden="true" /> Reveal
        </button>
        <button
          type="button"
          className={inputMode === "flag" ? "mode-button active" : "mode-button"}
          aria-pressed={inputMode === "flag"}
          onClick={() => setInputMode("flag")}
          disabled={gameOver}
        >
          <FlagTriangleRight size={15} aria-hidden="true" /> Flag
        </button>
      </div>

      {status === "won" && (
        <p className="game-message" role="status">
          You win! All safe cells are revealed.
        </p>
      )}
      {status === "lost" && (
        <p className="game-message" role="status">
          Boom! You hit a mine. Start a new game to try again.
        </p>
      )}

      <div className="board-area">
        <p className="sr-only" id="board-keyboard-instructions">
          Use the arrow keys to move between cells. Press Enter or Space to reveal or flag
          a cell according to the selected action mode.
        </p>
        {columns > 9 && (
          <p className="board-scroll-hint">
            Swipe or scroll the board to see all columns.
          </p>
        )}
        <div
          className="minesweeper-board"
          style={boardStyle}
          role="grid"
          aria-label={`${settings.label}: ${rows} by ${columns}, ${mines} mines`}
          aria-describedby="board-keyboard-instructions"
          onContextMenu={(event) => event.preventDefault()}
        >
          {board.map((line, row) =>
            line.map((cell, col) => {
              const isExploded = status === "lost" && cell.mine && cell.revealed;
              const classes = [
                "cell",
                cell.revealed ? "revealed" : "unrevealed",
                cell.flagged ? "flagged" : "",
                cell.revealed && cell.adjacentMines > 0
                  ? (numberClasses[cell.adjacentMines] ?? "")
                  : "",
                isExploded ? "mine-exploded" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <button
                  key={`${row}-${col}`}
                  ref={(element) => {
                    cellRefs.current[row * columns + col] = element;
                  }}
                  type="button"
                  className={classes}
                  role="gridcell"
                  aria-rowindex={row + 1}
                  aria-colindex={col + 1}
                  tabIndex={row === focusedCell.row && col === focusedCell.col ? 0 : -1}
                  aria-label={
                    cell.flagged
                      ? `Row ${row + 1}, column ${col + 1}, flagged`
                      : cell.revealed
                        ? `Row ${row + 1}, column ${col + 1}, ${cell.mine ? "mine" : cell.adjacentMines ? `${cell.adjacentMines} neighboring mines` : "empty"}`
                        : `Row ${row + 1}, column ${col + 1}, covered`
                  }
                  onMouseDown={(event) => handleMouseDown(event, row, col)}
                  onFocus={() => setFocusedCell({ row, col })}
                  onKeyDown={(event) => handleCellKeyDown(event, row, col)}
                  onClick={() => {
                    if (cell.revealed) return;
                    if (inputMode === "flag") toggleFlag(row, col);
                    else revealCell(row, col);
                  }}
                  onContextMenu={(event) => handleContextMenu(event, row, col)}
                  disabled={gameOver}
                >
                  {cell.flagged ? (
                    <Flag className="cell-flag" fill="currentColor" strokeWidth={1.5} />
                  ) : cell.revealed && cell.mine ? (
                    <Bomb size={16} aria-label="Mine" />
                  ) : cell.revealed && cell.adjacentMines > 0 ? (
                    cell.adjacentMines
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="board-footer">
        <span className="board-dimensions">
          <Grid2X2 size={14} aria-hidden="true" /> {rows} × {columns}
          <span className="footer-divider" />
          {mines} mines
        </span>
        <span className="board-instructions">
          <MousePointer2 size={14} aria-hidden="true" /> Tap: reveal
          <span className="footer-divider" />
          <Flag size={13} aria-hidden="true" /> Right-click or Flag mode: flag · Chord:
          hold left + right on a number
        </span>
      </div>
    </section>
  );
}
