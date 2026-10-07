import { Flag, Grid2X2, MousePointer2 } from "lucide-react";
import type { CSSProperties } from "react";

import { BOARD_SIZE, TOTAL_MINES } from "@/lib/game-settings";

import { DISPLAY_BOARD, FLAG_COUNT, PREVIEW_ELAPSED_TIME } from "./board-fixture";
import type { DisplayCell } from "./board-fixture";
import { GameStats } from "./game-stats";

// Keep the number colours in CSS. This only chooses which class a cell needs.
const numberClasses: Partial<Record<DisplayCell, string>> = {
  "1": "number-one",
  "2": "number-two",
  "3": "number-three",
};

function getCellClass(cell: DisplayCell) {
  const isCovered = cell === "hidden" || cell === "flag";
  const surfaceClass = isCovered ? "unrevealed" : "revealed";
  const flagClass = cell === "flag" ? "flagged" : "";
  const numberClass = numberClasses[cell] ?? "";

  return ["cell", surfaceClass, flagClass, numberClass].filter(Boolean).join(" ");
}

// Flags use an icon, number squares show their value, and the rest stay blank.
function getCellContent(cell: DisplayCell) {
  if (cell === "flag") {
    return <Flag className="cell-flag" fill="currentColor" strokeWidth={1.5} />;
  }

  if (numberClasses[cell]) {
    return cell;
  }

  return null;
}

// Passing the column count to CSS keeps the grid and board settings in sync.
const boardStyle = { "--board-columns": BOARD_SIZE } as CSSProperties;

export function MinesweeperBoard() {
  return (
    <section className="game-panel" aria-label="Minesweeper preview">
      <GameStats
        minesRemaining={TOTAL_MINES - FLAG_COUNT}
        totalMines={TOTAL_MINES}
        elapsedTime={PREVIEW_ELAPSED_TIME}
      />

      <div className="board-area">
        <div
          className="minesweeper-board"
          style={boardStyle}
          role="img"
          aria-label={`Static ${BOARD_SIZE} by ${BOARD_SIZE} Minesweeper board with ${FLAG_COUNT} flags. Visual preview; cells are not playable.`}
        >
          {/* Read this as one board image, rather than 256 separate controls.
              Replace the cell divs with buttons when the board becomes playable. */}
          {DISPLAY_BOARD.map((cell, index) => (
            <div key={index} className={getCellClass(cell)} aria-hidden="true">
              {getCellContent(cell)}
            </div>
          ))}
        </div>
      </div>

      <div className="board-footer">
        <span className="board-dimensions">
          <Grid2X2 size={14} aria-hidden="true" />
          {BOARD_SIZE} × {BOARD_SIZE}
          <span className="footer-divider" />
          {TOTAL_MINES} mines
        </span>

        <span className="board-instructions">
          <MousePointer2 size={14} aria-hidden="true" />
          Left click: reveal
          <span className="footer-divider" />
          <Flag size={13} aria-hidden="true" />
          Right click: flag
        </span>
      </div>
    </section>
  );
}
