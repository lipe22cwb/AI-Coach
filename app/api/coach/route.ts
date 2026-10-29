import { coachGameplay } from "@/lib/coach";
import { getConfiguredProvider } from "@/lib/coach/providers";
import { COACH_MAX_BODY_BYTES } from "@/lib/coach/http-security";
import { handleCoachPost } from "@/lib/coach/http-handlers";
import { reservePaidCoachCall } from "@/lib/coach/paid-access";
import { SAMPLE_SESSION } from "@/lib/coach/sample-session";
import { MAX_MOVES, validateSession } from "@/lib/coach/validate";

// Free rule coaching stays available to guests. Paid model calls require an
// authenticated player AND an atomic quota reservation in PostgreSQL.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleCoachPost(request, {
    validateSession,
    reservePaidCoachCall,
    coachGameplay,
  });
}

export async function GET(): Promise<Response> {
  const provider = getConfiguredProvider();
  const enabled = process.env.COACH_PAID_AI_ENABLED === "true";
  return Response.json(
    {
      configured: enabled && provider !== null,
      provider: enabled && provider ? { id: provider.id, model: provider.model } : null,
      sample: SAMPLE_SESSION,
      limits: {
        maxBodyBytes: COACH_MAX_BODY_BYTES,
        maxMoves: MAX_MOVES,
        paidAiRequiresSignIn: true,
        paidAiRequiresDatabaseQuota: true,
        paidAiEnabled: enabled,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
