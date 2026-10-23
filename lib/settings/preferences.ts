import { copyPreferences, DEFAULT_PREFERENCES } from "./defaults";
import type { SettingsPreferences, SettingsSection } from "./types";

export function preferencesForSection(
  preferences: SettingsPreferences,
  section: SettingsSection,
): Partial<SettingsPreferences> {
  switch (section) {
    case "coaching-style":
      return { coachingStyle: preferences.coachingStyle };
    case "explanation-detail":
      return { explanationDetail: preferences.explanationDetail };
    case "player-profile":
      return {
        experienceLevel: preferences.experienceLevel,
        selectedGoals: [...preferences.selectedGoals],
        customGoal: preferences.customGoal,
        competitiveness: preferences.competitiveness,
      };
  }
}

export function mergeSectionPreferences(
  base: SettingsPreferences,
  source: SettingsPreferences,
  section: SettingsSection,
): SettingsPreferences {
  return copyPreferences({ ...base, ...preferencesForSection(source, section) });
}

export function sectionHasChanges(
  section: SettingsSection,
  current: SettingsPreferences,
  saved: SettingsPreferences,
): boolean {
  return (
    JSON.stringify(preferencesForSection(current, section)) !==
    JSON.stringify(preferencesForSection(saved, section))
  );
}

export function preferencesHaveChanges(
  current: SettingsPreferences,
  saved: SettingsPreferences,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

export function resetSectionPreferences(
  current: SettingsPreferences,
  section: SettingsSection,
): SettingsPreferences {
  return mergeSectionPreferences(current, DEFAULT_PREFERENCES, section);
}
