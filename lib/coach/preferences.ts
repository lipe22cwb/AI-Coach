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
 * Adapt the built-in rule report to the player's preferences even when no AI
 * provider is configured. Only presentation text and bullet visibility change:
 * headline, score, metrics, notes, key moment, and findings stay factual.
 * The original findings are retained verbatim in the displayed bullets.
 */
export function shapeReportForPreferences<
  T extends {
    summary: string;
    strengths: string[];
    improvements: string[];
    nextSteps: string[];
  },
>(report: T, preferences: CoachPreferences): T {
  const maxBullets = preferences.explanationDetail === "brief" ? 2 : Infinity;
  const strengths = report.strengths.slice(0, maxBullets);
  const improvements = report.improvements.slice(0, maxBullets);
  const nextSteps = report.nextSteps.slice(0, maxBullets);

  // Balanced preserves the rule engine's neutral wording.
  if (preferences.coachingStyle === "balanced") {
    return { ...report, strengths, improvements, nextSteps };
  }

  // Prefix only the first bullet in each section: noticeably different tone,
  // without adding unverified gameplay claims or repeating labels everywhere.
  const lead = (items: string[], prefix: string): string[] =>
    items.map((item, index) => (index === 0 ? `${prefix}${item}` : item));

  if (preferences.coachingStyle === "encouraging") {
    return {
      ...report,
      summary: `${report.summary} You have useful feedback to build on in your next game.`,
      strengths: lead(strengths, "Keep building on this: "),
      improvements: lead(improvements, "An opportunity to improve: "),
      nextSteps: lead(nextSteps, "Try this next: "),
    };
  }

  // Direct delivers the same evidence with concise, action-oriented framing.
  return {
    ...report,
    summary: `Bottom line: ${report.summary}`,
    strengths,
    improvements: lead(improvements, "Focus on this: "),
    nextSteps: lead(nextSteps, "Next action: "),
  };
}
