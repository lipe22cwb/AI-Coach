import { parseNarrative, type CoachNarrative } from "./prompt";

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
  const milliseconds = Number(process.env.COACH_TIMEOUT_MS ?? 15000) || 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function failMessage(response: Response): Promise<string> {
  try {
    const body = await response.text();
    return body.slice(0, 300);
  } catch {
    return response.statusText;
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
      max_tokens: 1024,
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
      generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
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
