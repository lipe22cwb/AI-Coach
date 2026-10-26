import { createClient } from "@/lib/supabase/sever";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

// POST /api/ranked/matches/reveal
// Handles both the first reveal and subsequent reveals.
export async function POST(request: Request) {
  // Block requests from other website origins.
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }

  // Read and validate the player's requested move.
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400, headers });
  }

  const payload = body as Record<string, unknown>;
  const { matchId, row, column } = payload;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    typeof matchId !== "string" ||
    !uuidPattern.test(matchId) ||
    typeof row !== "number" ||
    !Number.isInteger(row) ||
    row < 0 ||
    row > 15 ||
    typeof column !== "number" ||
    !Number.isInteger(column) ||
    column < 0 ||
    column > 15
  ) {
    return Response.json(
      { error: "Invalid match ID or board position." },
      { status: 400, headers },
    );
  }

  try {
    // Step 1: Verify the signed-in player.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { error: "You must sign in to play Ranked." },
        { status: 401, headers },
      );
    }

    const admin = createAdminClient();

    // Step 2: Verify the match belongs to this player
    // and is still active.
    const { data: match, error: matchError } = await admin
      .from("ranked_matches")
      .select("id")
      .eq("id", matchId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (matchError) {
      console.error("Ranked match lookup failed:", matchError);

      return Response.json(
        { error: "Could not load Ranked match." },
        { status: 500, headers },
      );
    }

    if (!match) {
      return Response.json(
        { error: "Active Ranked match not found." },
        { status: 404, headers },
      );
    }

    // Step 3: Check whether the first move is complete.
    const { data: state, error: stateError } = await admin
      .from("ranked_match_state")
      .select("first_move_done")
      .eq("match_id", matchId)
      .maybeSingle();

    if (stateError || !state) {
      console.error("Ranked state lookup failed:", stateError);

      return Response.json(
        { error: "Could not load Ranked board." },
        { status: 500, headers },
      );
    }

    // Step 4: Choose the appropriate database function.
    const functionName = state.first_move_done
      ? "reveal_ranked_cell"
      : "reveal_first_ranked_cell";

    // Both database functions verify ownership again
    // and lock the match before updating it.
    const { data, error: revealError } = await admin.rpc(functionName, {
      p_match_id: matchId,
      p_user_id: user.id,
      p_row: row,
      p_column: column,
    });

    if (revealError) {
      console.error("Ranked reveal failed:", revealError);

      const rejected = revealError.code === "P0001";

      return Response.json(
        {
          error: rejected
            ? "This move cannot be completed."
            : "Could not process the Ranked move.",
        },
        { status: rejected ? 409 : 500, headers },
      );
    }

    if (!data) {
      return Response.json(
        { error: "No Ranked move result was returned." },
        { status: 500, headers },
      );
    }

    // Return the verified move result.
    return Response.json(data, { status: 200, headers });
  } catch (error) {
    console.error("Ranked reveal API error:", error);

    return Response.json(
      { error: "Ranked service is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
