"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import {
  replayRecordedGame,
  type Proof,
  type ReplayFrame,
  type VisibleCell,
} from "@/lib/coach/verified-replay";
import type { PracticeSession } from "@/lib/practice/history";

type BoardViewProps = {
  cells: readonly VisibleCell[];
  columns: number;
  selectedIndex: number;
  title: string;
  safeProofs: readonly Proof[];
  mineProofs: readonly Proof[];
};

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

function formatDecision(decision: ReplayFrame["decision"]) {
  if (decision === "good") return "Proven good decision";
  if (decision === "mistake") return "Verified mistake";
  return "Not enough evidence";
}

function formatAction(frame: ReplayFrame) {
  const action = frame.move.action;
  return `${action[0].toUpperCase()}${action.slice(1)} at row ${frame.move.row + 1}, column ${frame.move.col + 1}`;
}

function BoardView({
  cells,
  columns,
  selectedIndex,
  title,
  safeProofs,
  mineProofs,
}: BoardViewProps) {
  const safe = new Set(safeProofs.map((proof) => proof.index));
  const mines = new Set(mineProofs.map((proof) => proof.index));
  const cellWidth = columns >= 25 ? 20 : 25;
  const boardStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, ${cellWidth}px)`,
  };

  return (
    <div className="verified-board-panel">
      <h4>{title}</h4>
      <div className="verified-board-scroll">
        <div className="verified-board" style={boardStyle} role="img" aria-label={title}>
          {cells.map((cell, index) => {
            const number = cell.revealed && !cell.exploded ? cell.adjacentMines : null;
            const fact = cell.exploded
              ? "exploded mine"
              : cell.revealed
                ? `revealed ${number ?? "mine"}`
                : cell.flagged
                  ? "player flag"
                  : "covered";
            const proof =
              !cell.revealed &&
              (safe.has(index) ? "proven safe" : mines.has(index) ? "proven mine" : null);
            const selected = index === selectedIndex;
            return (
              <span
                key={index}
                className={[
                  "verified-cell",
                  cell.revealed ? "verified-revealed" : "verified-covered",
                  cell.exploded ? "verified-exploded" : "",
                  cell.flagged ? "verified-flagged" : "",
                  selected ? "verified-selected" : "",
                  proof === "proven safe" ? "verified-safe" : "",
                  proof === "proven mine" ? "verified-mine" : "",
                  number !== null && number > 0 ? (numberClasses[number] ?? "") : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={`Row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}: ${fact}${proof ? `, ${proof}` : ""}`}
                aria-hidden="true"
              >
                {cell.exploded
                  ? "✹"
                  : cell.flagged
                    ? "⚑"
                    : number !== null
                      ? number > 0
                        ? number
                        : ""
                      : proof === "proven safe"
                        ? "✓"
                        : proof === "proven mine"
                          ? "!"
                          : cell.revealed
                            ? "✹"
                            : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Gameplay evidence comes from visible numbers, not hindsight from the mine layout.
 * The layout is only used to replay how a square actually opened after the move.
 */
export function VerifiedReplayPanel({
  game,
  focusMoveNumber,
  focusRequestId,
}: {
  game: PracticeSession;
  focusMoveNumber?: number | null;
  focusRequestId?: number;
}) {
  const replay = useMemo(() => {
    try {
      return { value: replayRecordedGame(game), error: "" };
    } catch (error) {
      return {
        value: null,
        error:
          error instanceof Error ? error.message : "This recording cannot be replayed.",
      };
    }
  }, [game]);

  const frames = replay.value?.frames ?? [];
  const important = useMemo(() => {
    // Prioritize proven mistakes, then strong decisions. Do not create filler.
    const candidates = frames
      .map((frame, index) => ({ frame, index }))
      .filter(({ frame }) => frame.changed && frame.decision !== "not-enough-evidence");
    const mistakes = candidates.filter(({ frame }) => frame.decision === "mistake");
    const good = candidates.filter(({ frame }) => frame.decision === "good");
    return [...mistakes, ...good].slice(0, 5);
  }, [frames]);
  const [selectedMove, setSelectedMove] = useState<number | null>(null);
  useEffect(() => {
    if (focusMoveNumber != null) setSelectedMove(focusMoveNumber - 1);
  }, [focusMoveNumber, focusRequestId]);
  const selectedIndex =
    selectedMove !== null && selectedMove < frames.length
      ? selectedMove
      : (important[0]?.index ?? 0);
  const current = frames[selectedIndex];
  const counts = useMemo(
    () => ({
      mistakes: frames.filter((frame) => frame.changed && frame.decision === "mistake")
        .length,
      good: frames.filter((frame) => frame.changed && frame.decision === "good").length,
      uncertain: frames.filter(
        (frame) => frame.changed && frame.decision === "not-enough-evidence",
      ).length,
    }),
    [frames],
  );

  if (!replay.value || frames.length === 0) {
    return (
      <section className="verified-report" aria-label="Verified replay">
        <h3>Verified Replay</h3>
        <p role="alert">{replay.error || "No recorded moves are available to replay."}</p>
      </section>
    );
  }

  const position = current.move.row * game.columns + current.move.col;
  const selectedProof = [...current.deductions.safe, ...current.deductions.mines].find(
    (proof) => proof.index === position,
  );
  const outcome = game.outcome === "win" ? "WIN" : "LOSS";

  return (
    <section className="verified-report" aria-label="Verified gameplay analysis">
      <div className="verified-heading">
        <div>
          <span className="subtle-label">REPLAYED FROM YOUR REAL GAME</span>
          <h3>
            <ShieldCheck size={21} aria-hidden="true" /> Verified Move Review
          </h3>
          <p>
            {outcome} · {game.difficulty} · {game.rows} × {game.columns} ·{" "}
            {game.moves.length} actions
          </p>
        </div>
      </div>

      <div className="verified-totals" aria-label="Decision classifications">
        <div>
          <TriangleAlert size={15} aria-hidden="true" />
          <strong>{counts.mistakes}</strong>
          <span>Verified mistakes</span>
        </div>
        <div>
          <CheckCircle2 size={15} aria-hidden="true" />
          <strong>{counts.good}</strong>
          <span>Proven good moves</span>
        </div>
        <div>
          <CircleHelp size={15} aria-hidden="true" />
          <strong>{counts.uncertain}</strong>
          <span>Insufficient evidence</span>
        </div>
      </div>
      <p className="verified-note">
        These categories describe what could be proven from the visible board. “Not enough
        evidence” does not mean a move was bad or an unavoidable guess. Flags are player
        marks, not confirmed mines.
      </p>

      {important.length > 0 ? (
        <div className="verified-moments">
          <h4>Most useful verified moments</h4>
          <div className="verified-moment-buttons">
            {important.map(({ frame, index }) => (
              <button
                key={index}
                type="button"
                className={
                  index === selectedIndex ? "verified-moment active" : "verified-moment"
                }
                onClick={() => setSelectedMove(index)}
                aria-pressed={index === selectedIndex}
              >
                Move {frame.actionNumber} ·{" "}
                {frame.decision === "mistake" ? "Mistake" : "Good"}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="verified-note">
          This game has no provably good or mistaken moves under the current rules. You
          can still inspect its move history.
        </p>
      )}

      <div className="verified-move-nav">
        <button
          type="button"
          onClick={() => setSelectedMove(Math.max(0, selectedIndex - 1))}
          disabled={selectedIndex === 0}
        >
          <ChevronLeft size={17} aria-hidden="true" /> Previous
        </button>
        <label>
          <span>Move</span>
          <select
            value={selectedIndex}
            onChange={(event) => setSelectedMove(Number(event.target.value))}
          >
            {frames.map((frame, index) => (
              <option value={index} key={index}>
                #{frame.actionNumber}: {frame.move.action} ({frame.move.row + 1},{" "}
                {frame.move.col + 1})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setSelectedMove(Math.min(frames.length - 1, selectedIndex + 1))}
          disabled={selectedIndex === frames.length - 1}
        >
          Next <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="verified-decision">
        <strong>{formatDecision(current.decision)}</strong>
        <span>{formatAction(current)}</span>
        <p>
          {current.changed
            ? current.explanation
            : "This action did not change the visible board."}
        </p>
        {current.changed && selectedProof && (
          <p className="verified-evidence">Evidence: {selectedProof.reason}</p>
        )}
        {current.changed && current.mistakeType === "unnecessary-guess" && (
          <p className="verified-evidence">
            Examples of proven-safe alternatives:{" "}
            {current.deductions.safe
              .slice(0, 3)
              .map(
                (proof) =>
                  `row ${Math.floor(proof.index / game.columns) + 1}, column ${(proof.index % game.columns) + 1}`,
              )
              .join("; ")}
          </p>
        )}
      </div>

      <div className="verified-boards">
        <BoardView
          title={`Before move ${current.actionNumber}`}
          cells={current.before}
          columns={game.columns}
          selectedIndex={position}
          safeProofs={current.deductions.safe}
          mineProofs={current.deductions.mines}
        />
        <BoardView
          title={`After move ${current.actionNumber}`}
          cells={current.after}
          columns={game.columns}
          selectedIndex={position}
          safeProofs={[]}
          mineProofs={[]}
        />
      </div>
      <p className="verified-legend">
        Before: ✓ provably safe · ! provably mined · ⚑ player flag · outlined cell =
        chosen square. Deductions reflect only information available before that action.
      </p>
    </section>
  );
}
