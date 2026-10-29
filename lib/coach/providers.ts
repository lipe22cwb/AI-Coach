import { parseNarrative, type CoachNarrative } from "./prompt";

// Server-owned hard caps. Provider billing limits are still required separately.
const MAX_OUTPUT_TOKENS = 512;
const MAX_INPUT_CHARS = 14_000;

// One small adapter per AI provider. All three speak plain HTTPS, so the project
// needs no SDK dependency. Which provider runs is decided by environment
// variables, and if none is configured the rule coach answers instead.

export type ProviderId = "openai" | "anthropic" | "gemini";

export type ConfiguredProvider = {
  id: ProviderId;
  apiKey: string;
  model: string;
};

// Cheap, widely available defaults. Override with COACH_MODEL when a newer
// model is preferred; nothing else in the code needs to change.
const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
};

const PROVIDER_ORDER: ProviderId[] = ["openai", "anthropic", "gemini"];

function readKey(id: ProviderId): string | undefined {
  switch (id) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "gemini":
      return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  }
}

/**
 * Pick the provider to use.
 *
 * COACH_PROVIDER forces one ("openai", "anthropic" or "gemini"). Without it the
 * first provider that has a key wins, in the order above. Returns null when no
 * key is present, which is a normal, supported state.
 */
export function getConfiguredProvider(): ConfiguredProvider | null {
  const requested = (process.env.COACH_PROVIDER ?? "").trim().toLowerCase();
  const modelOverride = process.env.COACH_MODEL?.trim();
  const ids = PROVIDER_ORDER.includes(requested as ProviderId)
    ? [requested as ProviderId]
    : PROVIDER_ORDER;
  for (const id of ids) {
    const key = readKey(id);
    if (key) {
      return { id, apiKey: key, model: modelOverride || DEFAULT_MODELS[id] };
    }
  }
  return null;
}

function timeoutSignal(): { signal: AbortSignal; done: () => void } {
  const configured = Number(process.env.COACH_TIMEOUT_MS ?? 15000);
  const milliseconds = Number.isFinite(configured)
    ? Math.max(1000, Math.min(15000, configured))
    : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function failMessage(response: Response): Promise<string> {
  try {
    // Consume no upstream error body; never expose it to callers.
    return `provider HTTP ${response.status}`;
  } catch {
    return "provider request failed";
  }
}

async function askOpenAI(
  provider: ConfiguredProvider,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.4,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok)
    throw new Error(`OpenAI ${response.status}: ${await failMessage(response)}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

async function askAnthropic(
  provider: ConfiguredProvider,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok)
    throw new Error(`Anthropic ${response.status}: ${await failMessage(response)}`);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function askGemini(
  provider: ConfiguredProvider,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Gemini ${response.status}: ${await failMessage(response)}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("");
}

/** Ask the configured provider for the rewritten report. */
export async function requestNarrative(
  provider: ConfiguredProvider,
  system: string,
  user: string,
): Promise<CoachNarrative | null> {
  if (system.length + user.length > MAX_INPUT_CHARS) {
    throw new Error("Coaching prompt exceeded the server input limit.");
  }
  const { signal, done } = timeoutSignal();
  try {
    const text =
      provider.id === "openai"
        ? await askOpenAI(provider, system, user, signal)
        : provider.id === "anthropic"
          ? await askAnthropic(provider, system, user, signal)
          : await askGemini(provider, system, user, signal);
    return parseNarrative(text);
  } finally {
    done();
  }
}
