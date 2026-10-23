import { copyPreferences, DEFAULT_PREFERENCES } from "./defaults";
import type {
  CoachingStyle,
  Competitiveness,
  ExplanationDetail,
  ExperienceLevel,
  SettingsPreferences,
  SettingsRepository,
} from "./types";

const STORAGE_KEY = "ai-coach.settings.preferences.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<Value extends string>(
  value: unknown,
  allowedValues: readonly Value[],
  fallback: Value,
): Value {
  return typeof value === "string" && allowedValues.includes(value as Value)
    ? (value as Value)
    : fallback;
}

/** Merge stored data with defaults so older or partial records remain readable. */
export function normalizePreferences(value: unknown): SettingsPreferences {
  if (!isRecord(value)) return copyPreferences(DEFAULT_PREFERENCES);

  return {
    coachingStyle: oneOf<CoachingStyle>(
      value.coachingStyle,
      ["encouraging", "balanced", "direct"],
      DEFAULT_PREFERENCES.coachingStyle,
    ),
    explanationDetail: oneOf<ExplanationDetail>(
      value.explanationDetail,
      ["brief", "standard", "detailed"],
      DEFAULT_PREFERENCES.explanationDetail,
    ),
    experienceLevel: oneOf<ExperienceLevel>(
      value.experienceLevel,
      ["new", "some", "experienced"],
      DEFAULT_PREFERENCES.experienceLevel,
    ),
    selectedGoals: Array.isArray(value.selectedGoals)
      ? value.selectedGoals.filter((goal): goal is string => typeof goal === "string")
      : [...DEFAULT_PREFERENCES.selectedGoals],
    customGoal:
      typeof value.customGoal === "string"
        ? value.customGoal
        : DEFAULT_PREFERENCES.customGoal,
    competitiveness: oneOf<Competitiveness>(
      value.competitiveness,
      ["relaxed", "balanced", "competitive"],
      DEFAULT_PREFERENCES.competitiveness,
    ),
  };
}

/**
 * Browser storage adapter. Access to `window` happens only in load/save, so
 * creating the adapter is safe during server rendering.
 */
export function createLocalSettingsRepository(): SettingsRepository {
  return {
    async load() {
      if (typeof window === "undefined") {
        return copyPreferences(DEFAULT_PREFERENCES);
      }

      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (serialized === null) return copyPreferences(DEFAULT_PREFERENCES);

      try {
        return normalizePreferences(JSON.parse(serialized) as unknown);
      } catch {
        // Recover from malformed stored JSON; a later save will replace it.
        return copyPreferences(DEFAULT_PREFERENCES);
      }
    },
    async save(preferences) {
      if (typeof window === "undefined") {
        throw new Error("Browser storage is unavailable.");
      }

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(normalizePreferences(preferences)),
      );
    },
  };
}
