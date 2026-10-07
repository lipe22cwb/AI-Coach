import { Flag, RotateCcw, Timer } from "lucide-react";

type GameStatsProps = {
  minesRemaining: number;
  totalMines: number;
  elapsedTime: string;
};

// The board supplies these values. When gameplay is added, this component can
// show live stats without knowing how mines or the timer are calculated.
export function GameStats({ minesRemaining, totalMines, elapsedTime }: GameStatsProps) {
  return (
    <div className="game-stats">
      <div className="stat">
        <Flag size={18} aria-hidden="true" />
        <div>
          <span className="stat-label">Mines remaining</span>
          <span className="stat-value">
            {String(minesRemaining).padStart(2, "0")}
            <span className="stat-total"> / {totalMines}</span>
          </span>
        </div>
      </div>

      <div className="stat">
        <Timer size={19} aria-hidden="true" />
        <div>
          <span className="stat-label">Time elapsed</span>
          <span className="stat-value">{elapsedTime}</span>
        </div>
      </div>

      {/* The control is part of the mockup; it does not reset a game yet. */}
      <button
        type="button"
        className="new-game"
        aria-disabled="true"
        title="New game — preview only"
      >
        <RotateCcw size={16} aria-hidden="true" />
        <span>New Game</span>
      </button>
    </div>
  );
}
