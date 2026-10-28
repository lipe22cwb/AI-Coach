import { validateFocusSelection } from "@/lib/coach/evidence-report";
import { prepareVerifiedFocusInput } from "@/lib/coach/verified-focus-input";
import { getConfiguredProvider, requestNarrative } from "@/lib/coach/providers";

// The AI only selects an approved focus and style. The browser displays the
// verified, deterministic explanations, never model-authored gameplay facts.
// This endpoint accepts checkpoint-stamped finished Practice games only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDING_LENGTH = 200_000;
const responseHeaders = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders });
}

export async function POST(request: Request): Promise<Response> {
  // A cross-site browser request must not trigger a potentially billable model.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Invalid request origin." }, 403);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RECORDING_LENGTH) {
    return json({ error: "Recording is too large." }, 413);
  }

  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_RECORDING_LENGTH) {
      return json({ error: "Recording is too large." }, 413);
    }
    raw = JSON.parse(body);
  } catch {
    return json({ error: "Send valid JSON for a finished Practice game." }, 400);
  }

  // Use the SAME strict parser and replay verification used by the Phase 6
  // verified-brief boundary. No API call occurs before these checks pass.
  const prepared = prepareVerifiedFocusInput(raw);
  if (!prepared.ok) {
    return json({ error: prepared.error }, prepared.status);
  }
  const { report } = prepared;

  const fallback = {
    focusId: report.moments[0]?.id ?? null,
    style: "step-by-step",
    selectedBy: "rules",
    model: null,
    note: "The verified analysis chose the focus; no AI provider was needed.",
  };
  const provider = getConfiguredProvider();
  if (!provider || report.moments.length === 0) {
    return json({
      ...fallback,
      note:
        report.moments.length === 0
          ? "No verified moments were available to prioritize."
          : "No AI provider is configured, so the verified rule coach chose a focus.",
    });
  }

  const choices = report.moments.map((moment) => ({
    id: moment.id,
    kind: moment.kind,
    category: moment.category,
    occurrences: moment.occurrences,
    what: moment.finding,
    proof: moment.evidence,
    advice: moment.nextTime,
  }));

  try {
    // The existing provider adapter returns JSON. It can select only one of
    // our already verified IDs and one of two presentation styles.
    const selection = await requestNarrative(
      provider,
      [
        "You select ONE teaching priority from already verified Minesweeper findings.",
        "Use only the allowed moment IDs. Prefer repeatable mistakes over praise; do not manufacture findings.",
        "Return a JSON object with exactly these keys:",
        '{"headline":"move-N", "summary":"direct", "strengths":[], "improvements":[], "nextSteps":[]}',
        "headline must equal exactly one supplied id. summary must be exactly 'direct' or 'step-by-step'.",
        "Do not write any explanations or extra words. You cannot change the evidence.",
      ].join("\n"),
      JSON.stringify({ available: choices, allowedStyles: ["direct", "step-by-step"] }),
    );
    const checked = validateFocusSelection(
      report,
      selection?.headline,
      selection?.summary,
    );
    if (!checked) {
      return json({
        ...fallback,
        note: "AI selection was outside the allowed evidence; the verified fallback was used.",
      });
    }
    return json({
      focusId: checked.focusId,
      style: checked.style,
      selectedBy: provider.id,
      model: provider.model,
      note: "AI prioritized a verified moment. All displayed facts and advice remain rule-generated.",
    });
  } catch {
    return json({
      ...fallback,
      note: "AI selection was unavailable; verified rule-based focus was used.",
    });
  }
}
