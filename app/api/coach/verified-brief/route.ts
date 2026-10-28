import { buildEvidenceReport } from "@/lib/coach/evidence-report";
import {
  makeVerifiedBrief,
  parseVerifiedPracticeRecording,
} from "@/lib/coach/verified-brief";

// Phase 6: read-only, provider-neutral integration boundary for future FastAPI.
// This endpoint never calls a model, changes player data, or sends credentials.
// It is for unranked Practice recordings only, not official Ranked verification.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 200_000) {
    return Response.json({ error: "Recording exceeds the size limit." }, { status: 413 });
  }

  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > 200_000) {
      return Response.json(
        { error: "Recording exceeds the size limit." },
        { status: 413 },
      );
    }
    raw = JSON.parse(body);
  } catch {
    return Response.json({ error: "Send a valid JSON recording." }, { status: 400 });
  }

  let game;
  try {
    game = parseVerifiedPracticeRecording(raw);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid recording." },
      { status: 400 },
    );
  }

  try {
    // This independently replays the game, checks every visible-board hash,
    // validates its final outcome, and derives coaching from visible evidence.
    const report = buildEvidenceReport(game);
    const brief = makeVerifiedBrief(game, report);
    return Response.json(brief, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Replay did not match the recording. No AI brief was produced." },
      { status: 422 },
    );
  }
}
