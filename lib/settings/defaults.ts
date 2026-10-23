import type { SettingsPreferences } from "./types";

export const DEFAULT_PREFERENCES: SettingsPreferences = {
  coachingStyle: "balanced",
  explanationDetail: "standard",
  experienceLevel: "some",
  selectedGoals: [],
  customGoal: "",
  competitiveness: "balanced",
};

export function copyPreferences(preferences: SettingsPreferences): SettingsPreferences {
  return { ...preferences, selectedGoals: [...preferences.selectedGoals] };
}
