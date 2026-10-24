import { createClient } from "@/lib/supabase/sever";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
};

// POST /api/ranked/matches/chord
// Chords a revealed numbered square in a Ranked match.
export async function POST(request: Request) {
  // Only allow requests from our own website.
  const origin = request.headers.get("origin");

  if (origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }

  // Read the requested square.
  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid request body." }, { status: 400, headers });
  }

  const payload = body as Record<string, unknown>;
  const { matchId, row, column } = payload;

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Verify the match ID and board coordinates.
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
    // Step 1: Verify the player is signed in.
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

    // Step 2: Call the server-controlled chording function.
    // Supabase checks ownership, flags, and game rules.
    const admin = createAdminClient();

    const { data, error: chordError } = await admin.rpc("chord_ranked_cell", {
      p_match_id: matchId,
      p_user_id: user.id,
      p_row: row,
      p_column: column,
    });

    if (chordError) {
      console.error("Ranked chord failed:", chordError);

      const rejected = chordError.code === "P0001";

      return Response.json(
        {
          error: rejected
            ? "This chord action is not allowed."
            : "Could not process the Ranked chord.",
        },
        { status: rejected ? 409 : 500, headers },
      );
    }

    if (!data) {
      return Response.json(
        { error: "No chord result was returned." },
        { status: 500, headers },
      );
    }

    // Return the verified move result.
    return Response.json(data, { status: 200, headers });
  } catch (error) {
    console.error("Ranked chord API error:", error);

    return Response.json(
      { error: "Ranked service is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
