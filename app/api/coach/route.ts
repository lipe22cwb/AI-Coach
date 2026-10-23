import { coachGameplay } from "@/lib/coach";
import { SAMPLE_SESSION } from "@/lib/coach/sample-session";
import { getConfiguredProvider } from "@/lib/coach/providers";
import type { GameplayMove, GameplaySession, MoveAction } from "@/lib/coach/types";

// POST /api/coach — send one recorded game, get a coaching report back.
// GET  /api/coach — provider status plus the sample game, used by the page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: MoveAction[] = ["reveal", "flag", "unflag", "chord"];
const OUTCOMES = ["win", "loss", "in-progress"];

type ParseResult = { session: GameplaySession } | { error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
}

/**
 * Check the incoming game data before it reaches the analyser. The goal is a
 * clear 400 with a helpful message rather than a confusing crash deep inside
 * the engine.
 */
function parseSession(body: unknown): ParseResult {
  if (!isObject(body)) {
    return { error: "Send a JSON object describing one game." };
  }

  const boardSize = asInt(body.boardSize);
  if (boardSize === null || boardSize < 2 || boardSize > 50) {
    return { error: "boardSize must be a whole number between 2 and 50." };
  }
  const total = boardSize * boardSize;

  const mineCount = asInt(body.mineCount);
  if (mineCount === null || mineCount < 0 || mineCount >= total) {
    return { error: "mineCount must be a whole number between 0 and boardSize²-1." };
  }

  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  if (!OUTCOMES.includes(outcome)) {
    return { error: 'outcome must be "win", "loss" or "in-progress".' };
  }

  let mines: number[] | undefined;
  if (body.mines !== undefined) {
    if (!Array.isArray(body.mines)) {
      return { error: "mines must be an array of row-major square indices." };
    }
    mines = [];
    for (const entry of body.mines) {
      const index = asInt(entry);
      if (index === null || index < 0 || index >= total) {
        return { error: `Every mine index must be between 0 and ${total - 1}.` };
      }
      mines.push(index);
    }
  }

  if (!Array.isArray(body.moves)) {
    return { error: "moves must be an array of { row, col, action } objects." };
  }
  const moves: GameplayMove[] = [];
  for (let i = 0; i < body.moves.length; i += 1) {
    const raw = body.moves[i];
    if (!isObject(raw)) return { error: `Move ${i + 1} is not an object.` };
    const row = asInt(raw.row);
    const col = asInt(raw.col);
    const action = typeof raw.action === "string" ? raw.action : "";
    if (
      row === null ||
      col === null ||
      row < 0 ||
      col < 0 ||
      row >= boardSize ||
      col >= boardSize
    ) {
      return { error: `Move ${i + 1} has a row or column outside the board.` };
    }
    if (!ACTIONS.includes(action as MoveAction)) {
      return { error: `Move ${i + 1} must use one of: ${ACTIONS.join(", ")}.` };
    }
    const atMs = asInt(raw.atMs);
    moves.push({
      row,
      col,
      action: action as MoveAction,
      ...(atMs !== null ? { atMs } : {}),
    });
  }

  const durationSeconds = asInt(body.durationSeconds);

  return {
    session: {
      game: typeof body.game === "string" ? body.game : "minesweeper",
      difficulty: typeof body.difficulty === "string" ? body.difficulty : undefined,
      boardSize,
      mineCount,
      outcome: outcome as GameplaySession["outcome"],
      durationSeconds:
        durationSeconds !== null && durationSeconds >= 0 ? durationSeconds : undefined,
      mines,
      moves,
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseSession(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const result = await coachGameplay(parsed.session);
  return Response.json(result);
}

export async function GET(): Promise<Response> {
  const provider = getConfiguredProvider();
  return Response.json({
    configured: provider !== null,
    provider: provider ? { id: provider.id, model: provider.model } : null,
    sample: SAMPLE_SESSION,
    usage: {
      method: "POST",
      body: "GameplaySession",
      shape: {
        game: "minesweeper",
        difficulty: "Beginner",
        boardSize: 9,
        mineCount: 10,
        outcome: "win | loss | in-progress",
        durationSeconds: 38,
        mines: [5, 9, 23],
        moves: [{ row: 2, col: 4, action: "reveal" }],
      },
    },
  });
}
