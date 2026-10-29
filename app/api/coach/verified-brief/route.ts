import { guardPublicCoachPost } from "@/lib/coach/public-rate-guard";
import { checkPublicCoachRateLimit } from "@/lib/coach/public-rate-limit";
import { buildEvidenceReport } from "@/lib/coach/evidence-report";
import { readLimitedCoachJson, VERIFIED_MAX_BODY_BYTES } from "@/lib/coach/http-security";
import {
  makeVerifiedBrief,
  parseVerifiedPracticeRecording,
} from "@/lib/coach/verified-brief";

// Read-only deterministic analysis; does not call an AI provider.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request): Promise<Response> {
  return guardPublicCoachPost(request, checkPublicCoachRateLimit, () =>
    handleVerifiedBriefPost(request),
  );
}

async function handleVerifiedBriefPost(request: Request): Promise<Response> {
  const parsed = await readLimitedCoachJson(request, VERIFIED_MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  let game;
  try {
    game = parseVerifiedPracticeRecording(parsed.value);
  } catch {
    return Response.json(
      { error: "Invalid Practice recording." },
      { status: 400, headers },
    );
  }

  try {
    const report = buildEvidenceReport(game);
    const brief = makeVerifiedBrief(game, report);
    return Response.json(brief, { headers });
  } catch {
    return Response.json(
      { error: "Replay did not match the recording. No AI brief was produced." },
      { status: 422, headers },
    );
  }
}
