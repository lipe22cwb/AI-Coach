import { copyPreferences, DEFAULT_PREFERENCES } from "./defaults";
import type {
  CoachingStyle,
  Competitiveness,
  ExplanationDetail,
  ExperienceLevel,
  SettingsPreferences,
  SettingsRepository,
} from "./types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "ai-coach.settings.preferences.v1";
const VALID_GOALS = ["patterns", "logic", "guessing", "flagging", "efficiency"];

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
      ? [...new Set(value.selectedGoals)].filter(
          (goal): goal is string =>
            typeof goal === "string" && VALID_GOALS.includes(goal),
        )
      : [...DEFAULT_PREFERENCES.selectedGoals],
    customGoal:
      typeof value.customGoal === "string"
        ? value.customGoal.slice(0, 160)
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

export function clearLocalSettingsPreferences() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A failed cleanup must not invalidate preferences already migrated to the account.
  }
}

type SupabaseClientProvider = typeof getSupabaseBrowserClient;

async function getCurrentUserId(getClient: SupabaseClientProvider) {
  const client = getClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}

async function readAccountPreferences(userId: string, getClient: SupabaseClientProvider) {
  const client = getClient();
  if (!client) throw new Error("Supabase is not configured.");

  const { data, error } = await client
    .from("user_preferences")
    .select(
      "coaching_style, explanation_detail, experience_level, selected_goals, custom_goal, competitiveness",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return normalizePreferences({
    coachingStyle: data.coaching_style,
    explanationDetail: data.explanation_detail,
    experienceLevel: data.experience_level,
    selectedGoals: data.selected_goals,
    customGoal: data.custom_goal,
    competitiveness: data.competitiveness,
  });
}

async function writeAccountPreferences(
  userId: string,
  preferences: SettingsPreferences,
  getClient: SupabaseClientProvider,
) {
  const client = getClient();
  if (!client) throw new Error("Supabase is not configured.");

  const normalized = normalizePreferences(preferences);
  const { error } = await client.from("user_preferences").upsert(
    {
      user_id: userId,
      coaching_style: normalized.coachingStyle,
      explanation_detail: normalized.explanationDetail,
      experience_level: normalized.experienceLevel,
      selected_goals: normalized.selectedGoals,
      custom_goal: normalized.customGoal,
      competitiveness: normalized.competitiveness,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

/** Uses account storage when signed in and migrates existing local preferences once. */
export function createSettingsRepository(
  getClient: SupabaseClientProvider = getSupabaseBrowserClient,
): SettingsRepository {
  const localRepository = createLocalSettingsRepository();

  return {
    async load() {
      const userId = await getCurrentUserId(getClient);
      if (!userId) return localRepository.load();

      const accountPreferences = await readAccountPreferences(userId, getClient);
      if (accountPreferences) {
        clearLocalSettingsPreferences();
        return accountPreferences;
      }

      const localPreferences = await localRepository.load();
      await writeAccountPreferences(userId, localPreferences, getClient);
      clearLocalSettingsPreferences();
      return localPreferences;
    },
    async save(preferences) {
      const userId = await getCurrentUserId(getClient);
      if (!userId) return localRepository.save(preferences);
      await writeAccountPreferences(userId, preferences, getClient);
    },
  };
}
