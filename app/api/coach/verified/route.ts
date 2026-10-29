import { validateFocusSelection } from "@/lib/coach/evidence-report";
import { readLimitedCoachJson, VERIFIED_MAX_BODY_BYTES } from "@/lib/coach/http-security";
import { reservePaidCoachCall } from "@/lib/coach/paid-access";
import { prepareVerifiedFocusInput } from "@/lib/coach/verified-focus-input";
import { getConfiguredProvider, requestNarrative } from "@/lib/coach/providers";

// Deterministic evidence remains free. Only AI prioritization consumes a quota.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readLimitedCoachJson(request, VERIFIED_MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  const prepared = prepareVerifiedFocusInput(parsed.value);
  if (!prepared.ok) return json({ error: prepared.error }, prepared.status);
  const { report } = prepared;

  const fallback = {
    focusId: report.moments[0]?.id ?? null,
    style: "step-by-step",
    selectedBy: "rules",
    model: null,
    note: "Verified rule coaching selected the focus; AI was not needed or available.",
  };
  if (report.moments.length === 0) {
    return json({
      ...fallback,
      note: "No verified moments were available to prioritize.",
    });
  }

  const paidAiReserved = await reservePaidCoachCall();
  const provider = paidAiReserved ? getConfiguredProvider() : null;
  if (!provider) return json(fallback);

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
    const selection = await requestNarrative(
      provider,
      [
        "Choose ONE already verified Minesweeper coaching focus.",
        "Only use supplied moment IDs. Never invent gameplay facts.",
        'Return JSON exactly: {"headline":"move-N","summary":"direct","strengths":[],"improvements":[],"nextSteps":[]}',
        "headline must equal a supplied id. summary must be 'direct' or 'step-by-step'.",
        "Do not add explanations or other text.",
      ].join("\n"),
      JSON.stringify({ available: choices, allowedStyles: ["direct", "step-by-step"] }),
    );
    const checked = validateFocusSelection(
      report,
      selection?.headline,
      selection?.summary,
    );
    if (!checked) return json(fallback);
    return json({
      focusId: checked.focusId,
      style: checked.style,
      selectedBy: provider.id,
      model: provider.model,
      note: "AI selected a verified focus. Gameplay facts remain rule-generated.",
    });
  } catch {
    return json(fallback);
  }
}
