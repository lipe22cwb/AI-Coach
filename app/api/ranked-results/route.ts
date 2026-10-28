import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/sever";
import {
  parseRankedBoardQuery,
  RANKED_COLUMNS,
  RANKED_LEADERBOARD_LIMIT,
  RANKED_MINES,
  RANKED_ROWS,
  serializeVerifiedResults,
} from "@/lib/ranked/verified-results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const unavailable = () =>
  Response.json(
    { error: "Verified Ranked results are not available yet." },
    { status: 503, headers },
  );

// GET is public, but it only reads records created by the database's
// authoritative completed-match trigger. A missing schema is NOT a reason to
// fall back to unverified JSON files or browser-supplied results.
export async function GET(request: Request): Promise<Response> {
  const query = parseRankedBoardQuery(new URL(request.url).searchParams);
  if (!query.ok) {
    return Response.json({ error: query.error }, { status: 400, headers });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return unavailable();
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ranked_verified_results")
      .select("duration_ms, finished_at")
      .eq("board_rows", RANKED_ROWS)
      .eq("board_columns", RANKED_COLUMNS)
      .eq("mine_count", RANKED_MINES)
      .order("duration_ms", { ascending: true })
      .order("finished_at", { ascending: true })
      .limit(RANKED_LEADERBOARD_LIMIT);
    if (error) {
      console.error("Verified Ranked leaderboard read failed:", error.code);
      return unavailable();
    }
    const results = serializeVerifiedResults(data);
    return Response.json(
      {
        mode: "ranked",
        source: "server-verified",
        boardSize: RANKED_ROWS,
        mineCount: RANKED_MINES,
        timing: "server-wall-clock",
        results,
      },
      { status: 200, headers },
    );
  } catch (error) {
    console.error("Verified Ranked leaderboard unavailable:", error);
    return unavailable();
  }
}

// POST is intentionally NOT a submission mechanism, even for signed-in users.
// The only allowed result-writer is the database trigger after a trusted
// Ranked RPC changes a match's status to 'won'. Client-supplied times and
// claimed outcomes are never read or persisted here.
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return unavailable();
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return Response.json(
        { error: "Sign in to play Ranked. Direct result submissions are disabled." },
        { status: 401, headers },
      );
    }
    return Response.json(
      {
        error:
          "Direct Ranked result submissions are disabled. A winning result is recorded only after the server-controlled match confirms the win.",
      },
      { status: 409, headers },
    );
  } catch {
    return unavailable();
  }
}
