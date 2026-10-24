import { createClient } from "@/lib/supabase/sever";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

// POST /api/ranked/matches/flag
// Places or removes a flag in an authenticated Ranked match.
export async function POST(request: Request) {
  // Only accept requests from our website.
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }

  // Read the requested board position.
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400, headers });
  }

  const payload = body as Record<string, unknown>;
  const { matchId, row, column } = payload;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Validate the match ID and square coordinates.
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

    // Step 2: Ask the database to toggle the flag.
    // The SQL function verifies match ownership,
    // checks the board rules, and records the move.
    const admin = createAdminClient();

    const { data, error: flagError } = await admin.rpc("toggle_ranked_flag", {
      p_match_id: matchId,
      p_user_id: user.id,
      p_row: row,
      p_column: column,
    });

    if (flagError) {
      console.error("Ranked flag failed:", flagError);

      const rejected = flagError.code === "P0001";

      return Response.json(
        {
          error: rejected
            ? "This flag action is not allowed."
            : "Could not update the Ranked flag.",
        },
        { status: rejected ? 409 : 500, headers },
      );
    }

    if (!data) {
      return Response.json(
        { error: "No flag result was returned." },
        { status: 500, headers },
      );
    }

    // Return only the result of the flag action.
    return Response.json(data, { status: 200, headers });
  } catch (error) {
    console.error("Ranked flag API error:", error);

    return Response.json(
      { error: "Ranked service is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
