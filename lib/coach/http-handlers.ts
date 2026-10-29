import {
  COACH_MAX_BODY_BYTES,
  VERIFIED_MAX_BODY_BYTES,
  readLimitedCoachJson,
} from "./http-security.ts";
import type { CoachResult, GameplaySession } from "./types";
import type { ValidationResult } from "./validate";
import type { VerifiedFocusInput } from "./verified-focus-input";
import type { ConfiguredProvider } from "./providers";
import type { CoachNarrative } from "./prompt";
import type { EvidenceReport } from "./evidence-report";

// Keep the real HTTP orchestration testable without creating fake accounts,
// sending provider requests, or modifying the staging database. The Next.js
// routes pass their real dependencies; the tests pass local fakes instead.
const noStoreHeaders = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStoreHeaders });
}

export type CoachPostDependencies = {
  validateSession: (input: unknown) => ValidationResult;
  reservePaidCoachCall: () => Promise<boolean>;
  coachGameplay: (
    session: GameplaySession,
    paidAiReserved: boolean,
  ) => Promise<CoachResult>;
};

export async function handleCoachPost(
  request: Request,
  deps: CoachPostDependencies,
): Promise<Response> {
  const parsedBody = await readLimitedCoachJson(request, COACH_MAX_BODY_BYTES);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = deps.validateSession(parsedBody.value);
  if ("error" in parsed) return json({ error: parsed.error }, 400);

  // The reservation gate checks the authenticated account and the atomic
  // database quota. Without a reservation, only the rule coach may answer.
  const paidAiReserved = await deps.reservePaidCoachCall();
  return json(await deps.coachGameplay(parsed.session, paidAiReserved));
}

export type VerifiedCoachPostDependencies = {
  prepareVerifiedFocusInput: (input: unknown) => VerifiedFocusInput;
  reservePaidCoachCall: () => Promise<boolean>;
  getConfiguredProvider: () => ConfiguredProvider | null;
  requestNarrative: (
    provider: ConfiguredProvider,
    system: string,
    user: string,
  ) => Promise<CoachNarrative | null>;
  validateFocusSelection: (
    report: EvidenceReport,
    id: unknown,
    style: unknown,
  ) => { focusId: string; style: "direct" | "step-by-step" } | null;
};

export async function handleVerifiedCoachPost(
  request: Request,
  deps: VerifiedCoachPostDependencies,
): Promise<Response> {
  const parsed = await readLimitedCoachJson(request, VERIFIED_MAX_BODY_BYTES);
  if (!parsed.ok) return parsed.response;

  const prepared = deps.prepareVerifiedFocusInput(parsed.value);
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

  const paidAiReserved = await deps.reservePaidCoachCall();
  const provider = paidAiReserved ? deps.getConfiguredProvider() : null;
  if (!provider) return json(fallback);

  // Only evidence established by the deterministic replay reaches the model.
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
    const selection = await deps.requestNarrative(
      provider,
      [
        "Choose ONE already verified Minesweeper coaching focus.",
        "Only use supplied moment IDs. Never invent gameplay facts.",
        '{"headline":"move-N","summary":"direct","strengths":[],"improvements":[],"nextSteps":[]}',
        "headline must equal a supplied id. summary must be 'direct' or 'step-by-step'.",
        "Do not add explanations or other text.",
      ].join("\n"),
      JSON.stringify({ available: choices, allowedStyles: ["direct", "step-by-step"] }),
    );
    const checked = deps.validateFocusSelection(
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
    // Never echo provider errors (which may contain request details) to callers.
    return json(fallback);
  }
}
