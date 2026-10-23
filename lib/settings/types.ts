export type SettingsSection = "coaching-style" | "explanation-detail" | "player-profile";

export type CoachingStyle = "encouraging" | "balanced" | "direct";
export type ExplanationDetail = "brief" | "standard" | "detailed";
export type ExperienceLevel = "new" | "some" | "experienced";
export type Competitiveness = "relaxed" | "balanced" | "competitive";

export type SettingsPreferences = {
  coachingStyle: CoachingStyle;
  explanationDetail: ExplanationDetail;
  experienceLevel: ExperienceLevel;
  selectedGoals: string[];
  customGoal: string;
  competitiveness: Competitiveness;
};

/** The saved preference fields that can be shared with coaching features. */
export type CoachPreferences = Pick<
  SettingsPreferences,
  | "coachingStyle"
  | "explanationDetail"
  | "experienceLevel"
  | "selectedGoals"
  | "customGoal"
  | "competitiveness"
>;

export interface SettingsRepository {
  load(): Promise<SettingsPreferences>;
  save(preferences: SettingsPreferences): Promise<void>;
}
