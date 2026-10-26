import { createClient } from "@/lib/supabase/sever";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
};

// GET /api/ranked/matches/current
// Restores the signed-in player's active Ranked game.
export async function GET() {
  try {
    // Step 1: Verify the currently signed-in player.
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

    // Step 2: Find the player's active Ranked match.
    const admin = createAdminClient();

    const { data: match, error: matchError } = await admin
      .from("ranked_matches")
      .select("id")
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

    // The player might not have an unfinished match.
    if (!match) {
      return Response.json(
        { error: "No active Ranked match found." },
        { status: 404, headers },
      );
    }

    // Step 3: Ask Supabase for the player-visible board.
    // This function verifies ownership again.
    const { data, error: boardError } = await admin.rpc("get_ranked_visible_board", {
      p_match_id: match.id,
      p_user_id: user.id,
    });

    if (boardError) {
      console.error("Ranked board recovery failed:", boardError);

      return Response.json(
        { error: "Could not restore Ranked board." },
        { status: 500, headers },
      );
    }

    if (!data) {
      return Response.json(
        { error: "No Ranked board data was returned." },
        { status: 500, headers },
      );
    }

    // Step 4: Return only the visible board information.
    return Response.json(data, { status: 200, headers });
  } catch (error) {
    console.error("Ranked recovery API error:", error);

    return Response.json(
      { error: "Ranked service is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
