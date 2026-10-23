import type { CoachPreferences, SettingsPreferences, SettingsRepository } from "./types";

/** Select a safe copy of the coaching context from the full Settings record. */
export function toCoachPreferences(
  preferences: SettingsPreferences,
): CoachPreferences {
  return {
    coachingStyle: preferences.coachingStyle,
    explanationDetail: preferences.explanationDetail,
    experienceLevel: preferences.experienceLevel,
    selectedGoals: [...preferences.selectedGoals],
    customGoal: preferences.customGoal,
    competitiveness: preferences.competitiveness,
  };
}

/** Load the saved coaching context through whichever Settings adapter is active. */
export async function loadCoachPreferences(
  repository: SettingsRepository,
): Promise<CoachPreferences> {
  return toCoachPreferences(await repository.load());
}
