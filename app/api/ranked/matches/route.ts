import { createClient } from "@/lib/supabase/sever";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

// POST /api/ranked/matches
// Creates a Ranked match or resumes the player's active match.
export async function POST(request: Request) {
  // Only accept requests from the same website origin.
  const origin = request.headers.get("origin");

  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
  }

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

    // Step 2: Create or resume the player's match.
    // The user ID comes from verified authentication,
    // never from a value submitted by the browser.
    const admin = createAdminClient();

    const { data: matchId, error: databaseError } = await admin.rpc(
      "start_ranked_match",
      {
        p_user_id: user.id,
      },
    );

    if (databaseError) {
      console.error("Ranked match creation failed:", databaseError);

      return Response.json(
        { error: "Could not start Ranked match." },
        { status: 500, headers },
      );
    }

    if (typeof matchId !== "string") {
      return Response.json(
        { error: "Invalid match response." },
        { status: 500, headers },
      );
    }

    // Step 3: Return only information safe for the player.
    return Response.json(
      {
        matchId,
        status: "active",
        message: "Ranked match created or resumed.",
      },
      { status: 200, headers },
    );
  } catch (error) {
    console.error("Ranked match API error:", error);

    return Response.json(
      { error: "Ranked service is temporarily unavailable." },
      { status: 503, headers },
    );
  }
}
