import { analyzeGameplay, toRuleReport } from "./analyze";
import { normalizeCoachPreferences, shapeReportForPreferences } from "./preferences";
import { buildCoachPrompt, buildCoachSystemPrompt } from "./prompt";
import { getConfiguredProvider, requestNarrative } from "./providers";
import type { CoachResult, GameplaySession } from "./types";

// The coaching pipeline in one place:
//   1. replay the game with the rule engine (always runs),
//   2. hand its findings to an AI provider when one is configured,
//   3. fall back to the rule report if there is no provider or it fails.
//
// Because step 1 stands alone, the feature works with no API key, no network
// and no cost — the AI layer only makes the same advice read better.

export async function coachGameplay(session: GameplaySession): Promise<CoachResult> {
  const preferences = normalizeCoachPreferences(session.preferences);
  const analysis = analyzeGameplay(session);
  const localReport = shapeReportForPreferences(toRuleReport(analysis), preferences);

  const provider = getConfiguredProvider();
  if (!provider) {
    return {
      report: localReport,
      fallbackReason:
        "No AI provider key is configured, so the built-in rule coach answered.",
    };
  }

  try {
    const narrative = await requestNarrative(
      provider,
      buildCoachSystemPrompt(preferences),
      buildCoachPrompt(session, analysis),
    );
    if (!narrative) {
      throw new Error("the provider did not return usable JSON");
    }
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      report: localReport,
      fallbackReason: `The AI provider failed (${reason}), so the built-in rule coach answered.`,
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
