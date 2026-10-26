import { createClient } from "@/lib/supabase/sever";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

// Ranked results cannot be trusted until server-side verification is ready.
export async function GET() {
  return Response.json(
    {
      error: "Ranked leaderboards are temporarily unavailable.",
    },
    {
      status: 503,
      headers,
    },
  );
}

export async function POST() {
  // Ranked games require authentication.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return Response.json(
      { error: "Ranked authentication is not configured." },
      { status: 503, headers },
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return Response.json(
        { error: "You must sign in to submit Ranked results." },
        { status: 401, headers },
      );
    }
  } catch {
    return Response.json(
      { error: "Could not verify your account." },
      { status: 503, headers },
    );
  }

  // Being signed in does not prove the player actually won.
  // A future server-controlled game session must verify the result.
  return Response.json(
    {
      error: "Ranked submissions are unavailable until game verification is implemented.",
    },
    {
      status: 503,
      headers,
    },
  );
}
