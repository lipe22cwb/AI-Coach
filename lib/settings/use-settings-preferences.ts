"use client";

import { useEffect, useState } from "react";

import { copyPreferences, DEFAULT_PREFERENCES } from "./defaults";
import {
  mergeSectionPreferences,
  preferencesHaveChanges,
  resetSectionPreferences,
  sectionHasChanges,
} from "./preferences";
import { createLocalSettingsRepository } from "./repository";
import type { SettingsPreferences, SettingsRepository, SettingsSection } from "./types";

type PreferenceKey = keyof SettingsPreferences;

export function useSettingsPreferences(repository?: SettingsRepository) {
  const [settingsRepository] = useState(
    () => repository ?? createLocalSettingsRepository(),
  );
  const [preferences, setPreferences] = useState(() =>
    copyPreferences(DEFAULT_PREFERENCES),
  );
  const [savedPreferences, setSavedPreferences] = useState(() =>
    copyPreferences(DEFAULT_PREFERENCES),
  );
  const [sectionMessages, setSectionMessages] = useState<Record<SettingsSection, string>>(
    {
      "coaching-style": "",
      "explanation-detail": "",
      "player-profile": "",
    },
  );
  const [globalMessage, setGlobalMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const hasUnsavedChanges = preferencesHaveChanges(preferences, savedPreferences);

  useEffect(() => {
    let isCurrent = true;
    settingsRepository
      .load()
      .then((loadedPreferences) => {
        if (!isCurrent) return;
        const snapshot = copyPreferences(loadedPreferences);
        setPreferences(snapshot);
        setSavedPreferences(copyPreferences(snapshot));
      })
      .catch(() => {
        if (isCurrent) setGlobalMessage("Could not load settings.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [settingsRepository]);

  function updatePreference<Key extends PreferenceKey>(
    key: Key,
    value: SettingsPreferences[Key],
  ) {
    setPreferences((current) => ({ ...current, [key]: value }));
    const section: SettingsSection =
      key === "coachingStyle"
        ? "coaching-style"
        : key === "explanationDetail"
          ? "explanation-detail"
          : "player-profile";
    setSectionMessages((current) => ({ ...current, [section]: "" }));
    setGlobalMessage("");
  }

  function toggleGoal(goal: string) {
    setPreferences((current) => ({
      ...current,
      selectedGoals: current.selectedGoals.includes(goal)
        ? current.selectedGoals.filter((currentGoal) => currentGoal !== goal)
        : [...current.selectedGoals, goal],
    }));
    setSectionMessages((current) => ({ ...current, "player-profile": "" }));
    setGlobalMessage("");
  }

  async function saveSection(section: SettingsSection) {
    const nextPreferences = mergeSectionPreferences(
      savedPreferences,
      preferences,
      section,
    );
    setIsSaving(true);
    try {
      await settingsRepository.save(nextPreferences);
      setSavedPreferences(nextPreferences);
      setSectionMessages((current) => ({
        ...current,
        [section]: "This section was saved on this device.",
      }));
      setGlobalMessage("");
    } catch {
      setSectionMessages((current) => ({
        ...current,
        [section]: "Could not save this section. Please try again.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAll() {
    const snapshot = copyPreferences(preferences);
    setIsSaving(true);
    try {
      await settingsRepository.save(snapshot);
      setSavedPreferences(snapshot);
      setSectionMessages({
        "coaching-style": "",
        "explanation-detail": "",
        "player-profile": "",
      });
      setGlobalMessage("All settings were saved on this device.");
    } catch {
      setGlobalMessage("Could not save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function discardAll() {
    setPreferences(copyPreferences(savedPreferences));
    setGlobalMessage("All unsaved changes discarded.");
  }

  function resetSection(section: SettingsSection) {
    setPreferences((current) => resetSectionPreferences(current, section));
    setSectionMessages((current) => ({
      ...current,
      [section]:
        "Defaults restored. Save this section to keep the changes on this device.",
    }));
    setGlobalMessage("");
  }

  function resetAll() {
    setPreferences(copyPreferences(DEFAULT_PREFERENCES));
    setSectionMessages({
      "coaching-style": "",
      "explanation-detail": "",
      "player-profile": "",
    });
    setGlobalMessage("Defaults restored. Save all settings to keep them on this device.");
  }

  return {
    preferences,
    sectionMessages,
    globalMessage,
    isLoading,
    hasUnsavedChanges,
    hasSectionChanges: (section: SettingsSection) =>
      sectionHasChanges(section, preferences, savedPreferences),
    isSaving,
    updatePreference,
    toggleGoal,
    saveSection,
    saveAll,
    discardAll,
    resetSection,
    resetAll,
  };
}
