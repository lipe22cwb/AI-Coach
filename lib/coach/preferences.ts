import { copyPreferences, DEFAULT_PREFERENCES } from "../settings/defaults";
import type {
  CoachPreferences,
  CoachingStyle,
  Competitiveness,
  ExperienceLevel,
  ExplanationDetail,
} from "../settings/types";

// The coaching side of the shared Settings contract (see
// docs/API-INTEGRATION-CONTRACTS.md). Preferences change wording and emphasis
// only. They never change the score, the metrics or any game fact.

export const COACHING_STYLES: readonly CoachingStyle[] = [
  "encouraging",
  "balanced",
  "direct",
];
export const EXPLANATION_DETAILS: readonly ExplanationDetail[] = [
  "brief",
  "standard",
  "detailed",
];
export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  "new",
  "some",
  "experienced",
];
export const COMPETITIVENESS_LEVELS: readonly Competitiveness[] = [
  "relaxed",
  "balanced",
  "competitive",
];
export const COACHING_GOALS = [
  "patterns",
  "logic",
  "guessing",
  "flagging",
  "efficiency",
] as const;

export const MAX_CUSTOM_GOAL_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickOne<Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return typeof value === "string" && allowed.includes(value as Value)
    ? (value as Value)
    : fallback;
}

/**
 * Fill missing preference fields with the Settings defaults. Unknown values are
 * replaced by defaults too, which keeps an old client from breaking a report.
 */
export function normalizeCoachPreferences(
  value: Partial<CoachPreferences> | undefined,
): CoachPreferences {
  const source = isRecord(value) ? value : {};
  const goals = Array.isArray(source.selectedGoals)
    ? [
        ...new Set(
          source.selectedGoals.filter(
            (goal): goal is string =>
              typeof goal === "string" &&
              (COACHING_GOALS as readonly string[]).includes(goal),
          ),
        ),
      ]
    : [...DEFAULT_PREFERENCES.selectedGoals];
  return {
    coachingStyle: pickOne(
      source.coachingStyle,
      COACHING_STYLES,
      DEFAULT_PREFERENCES.coachingStyle,
    ),
    explanationDetail: pickOne(
      source.explanationDetail,
      EXPLANATION_DETAILS,
      DEFAULT_PREFERENCES.explanationDetail,
    ),
    experienceLevel: pickOne(
      source.experienceLevel,
      EXPERIENCE_LEVELS,
      DEFAULT_PREFERENCES.experienceLevel,
    ),
    selectedGoals: goals,
    customGoal:
      typeof source.customGoal === "string"
        ? source.customGoal.slice(0, MAX_CUSTOM_GOAL_LENGTH)
        : DEFAULT_PREFERENCES.customGoal,
    competitiveness: pickOne(
      source.competitiveness,
      COMPETITIVENESS_LEVELS,
      DEFAULT_PREFERENCES.competitiveness,
    ),
  };
}

export type PreferenceParseResult = { preferences: CoachPreferences } | { error: string };

/**
 * Strict server-side validation of the optional `preferences` field. Missing
 * fields fall back to defaults; a present but invalid value is a 400, as the
 * integration contract asks, rather than being silently accepted.
 */
export function parseCoachPreferences(value: unknown): PreferenceParseResult {
  if (value === undefined) {
    return { preferences: copyPreferences(DEFAULT_PREFERENCES) };
  }
  if (!isRecord(value)) {
    return { error: "preferences must be an object when provided." };
  }

  const enumFields = [
    ["coachingStyle", COACHING_STYLES],
    ["explanationDetail", EXPLANATION_DETAILS],
    ["experienceLevel", EXPERIENCE_LEVELS],
    ["competitiveness", COMPETITIVENESS_LEVELS],
  ] as const;

  for (const [field, allowed] of enumFields) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
      return {
        error: `${field} must be one of: ${(allowed as readonly string[]).join(", ")}.`,
      };
    }
  }

  if (value.selectedGoals !== undefined) {
    if (!Array.isArray(value.selectedGoals)) {
      return { error: "selectedGoals must be an array of goal names." };
    }
    for (const goal of value.selectedGoals) {
      if (
        typeof goal !== "string" ||
        !(COACHING_GOALS as readonly string[]).includes(goal)
      ) {
        return {
          error: `selectedGoals may only contain: ${COACHING_GOALS.join(", ")}.`,
        };
      }
    }
  }

  if (value.customGoal !== undefined) {
    if (typeof value.customGoal !== "string") {
      return { error: "customGoal must be a string." };
    }
    if (value.customGoal.length > MAX_CUSTOM_GOAL_LENGTH) {
      return {
        error: `customGoal must be ${MAX_CUSTOM_GOAL_LENGTH} characters or fewer.`,
      };
    }
  }

  return { preferences: normalizeCoachPreferences(value as Partial<CoachPreferences>) };
}

/**
 * Shape the deterministic report for the requested explanation detail. The
 * facts and numbers are untouched; only the number of bullet points changes, so
 * the setting still has a visible effect when no AI provider is configured.
 */
export function shapeReportForPreferences<
  T extends {
    strengths: string[];
    improvements: string[];
    nextSteps: string[];
  },
>(report: T, preferences: CoachPreferences): T {
  if (preferences.explanationDetail !== "brief") return report;
  return {
    ...report,
    strengths: report.strengths.slice(0, 2),
    improvements: report.improvements.slice(0, 2),
    nextSteps: report.nextSteps.slice(0, 2),
  };
}
