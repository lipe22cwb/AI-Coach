// This file intentionally has no network or environment access, so the
// paid-provider selection policy can be tested without real API keys.
export type ProviderId = "openai" | "anthropic" | "gemini";

export type ConfiguredProvider = {
  id: ProviderId;
  apiKey: string;
  model: string;
};

// Server-owned allowlist, not user settings or arbitrary environment overrides.
// Any model change requires a reviewed code change and a pricing check.
export const APPROVED_COACH_MODELS: Readonly<Record<ProviderId, string>> = Object.freeze({
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
});

export function isApprovedProviderModel(provider: unknown, model: unknown): boolean {
  return (
    (provider === "openai" || provider === "anthropic" || provider === "gemini") &&
    model === APPROVED_COACH_MODELS[provider]
  );
}

export type ProviderSettings = {
  provider?: string;
  model?: string;
  keys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    google?: string;
  };
};

/**
 * Select ONLY the explicitly requested provider and its reviewed model.
 * Missing/invalid settings fail closed instead of silently selecting a
 * different paid provider or a more expensive model.
 */
export function resolveApprovedProvider(
  settings: ProviderSettings,
): ConfiguredProvider | null {
  const candidate = settings.provider?.trim().toLowerCase();
  if (candidate !== "openai" && candidate !== "anthropic" && candidate !== "gemini") {
    return null;
  }

  const approvedModel = APPROVED_COACH_MODELS[candidate];
  const model = settings.model === undefined ? approvedModel : settings.model.trim();
  if (!isApprovedProviderModel(candidate, model)) return null;

  const apiKey =
    candidate === "openai"
      ? settings.keys.openai
      : candidate === "anthropic"
        ? settings.keys.anthropic
        : (settings.keys.gemini ?? settings.keys.google);

  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  return { id: candidate, apiKey, model };
}
