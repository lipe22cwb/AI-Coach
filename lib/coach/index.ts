import { analyzeGameplay, toRuleReport } from "./analyze";
import { normalizeCoachPreferences, shapeReportForPreferences } from "./preferences";
import { buildCoachPrompt, buildCoachSystemPrompt } from "./prompt";
import { getConfiguredProvider, requestNarrative } from "./providers";
import type { CoachResult, GameplaySession } from "./types";

// Never call a paid model unless the API has already reserved one shared quota
// slot for this authenticated player. Default false protects other callers.
export async function coachGameplay(
  session: GameplaySession,
  paidAiReserved = false,
): Promise<CoachResult> {
  const preferences = normalizeCoachPreferences(session.preferences);
  const analysis = analyzeGameplay(session);
  const localReport = shapeReportForPreferences(toRuleReport(analysis), preferences);
  const provider = getConfiguredProvider();

  if (!paidAiReserved || !provider) {
    return {
      report: localReport,
      fallbackReason: provider
        ? "Verified rule coaching was used. Paid AI requires a signed-in player, enabled access and remaining usage quota."
        : "No AI provider key is configured, so the built-in rule coach answered.",
    };
  }

  try {
    const narrative = await requestNarrative(
      provider,
      buildCoachSystemPrompt(preferences),
      buildCoachPrompt(session, analysis),
    );
    if (!narrative) throw new Error("unusable model response");
    return {
      report: {
        ...localReport,
        headline: narrative.headline || localReport.headline,
        summary: narrative.summary || localReport.summary,
        strengths:
          narrative.strengths.length > 0 ? narrative.strengths : localReport.strengths,
        improvements:
          narrative.improvements.length > 0
            ? narrative.improvements
            : localReport.improvements,
        nextSteps:
          narrative.nextSteps.length > 0 ? narrative.nextSteps : localReport.nextSteps,
        source: provider.id,
        model: provider.model,
      },
      fallbackReason: null,
    };
  } catch {
    // Never include provider error body, request details, or credentials in a response.
    return {
      report: localReport,
      fallbackReason: "AI coaching was unavailable, so verified rule coaching was used.",
    };
  }
}

export { analyzeGameplay, toRuleReport };
export * from "./types";
export {
  SAMPLE_SESSION,
  SAMPLE_WIN_SESSION,
  SAMPLE_LOSS_SESSION,
} from "./sample-session";
