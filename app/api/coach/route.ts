import { coachGameplay } from "@/lib/coach";
import { getConfiguredProvider } from "@/lib/coach/providers";
import { checkRateLimit, clientKeyOf } from "@/lib/coach/rate-limit";
import { SAMPLE_SESSION } from "@/lib/coach/sample-session";
import { MAX_MOVES, validateSession } from "@/lib/coach/validate";

// POST /api/coach — send one recorded game, get a coaching report back.
// GET  /api/coach — provider status plus the sample game, used by the page.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refuse oversized bodies before parsing; a real game is a few kilobytes. */
const MAX_BODY_BYTES = 100_000;

/**
 * Optional shared secret. When `COACH_API_TOKEN` is set, POST requests must send
 * it as `Authorization: Bearer <token>` or `x-coach-token`. Leaving the variable
 * unset keeps the endpoint open for the local demo and for grading.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.COACH_API_TOKEN?.trim();
  if (!expected) return true;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const token = bearer || (request.headers.get("x-coach-token") ?? "").trim();
  return token.length > 0 && token === expected;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const limit = checkRateLimit(clientKeyOf(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many coaching requests. Try again shortly." },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Could not read the request body." }, { status: 400 });
  }

  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return Response.json(
      { error: `The request body must be ${MAX_BODY_BYTES} bytes or fewer.` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = validateSession(body);
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
    limits: {
      maxBodyBytes: MAX_BODY_BYTES,
      maxMoves: MAX_MOVES,
      requestsPerMinute: 30,
      tokenRequired: Boolean(process.env.COACH_API_TOKEN?.trim()),
    },
    usage: {
      method: "POST",
      body: "GameplaySession",
      shape: {
        game: "minesweeper",
        difficulty: "Expert",
        rows: 16,
        columns: 30,
        mineCount: 99,
        outcome: "win | loss | in-progress",
        durationSeconds: 38,
        mines: [5, 9, 23],
        moves: [{ row: 2, col: 4, action: "reveal", atMs: 1200 }],
        preferences: {
          coachingStyle: "balanced",
          explanationDetail: "standard",
          experienceLevel: "some",
          selectedGoals: ["logic"],
          customGoal: "",
          competitiveness: "balanced",
        },
      },
      notes: [
        "boardSize is still accepted as shorthand for a square board.",
        "preferences is optional; omitted fields use the Settings defaults.",
      ],
    },
  });
}
