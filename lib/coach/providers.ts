import { parseNarrative, type CoachNarrative } from "./prompt";
import {
  isApprovedProviderModel,
  resolveApprovedProvider,
  type ConfiguredProvider,
} from "./provider-policy";

export type { ConfiguredProvider, ProviderId } from "./provider-policy";

// Server-owned hard caps. Provider billing limits are still required separately.
const MAX_OUTPUT_TOKENS = 512;
const MAX_INPUT_CHARS = 14_000;

// Only an explicitly selected provider and its approved model may run.
// Missing or incorrect environment configuration means free rule Coaching.
export function getConfiguredProvider(): ConfiguredProvider | null {
  return resolveApprovedProvider({
    provider: process.env.COACH_PROVIDER,
    model: process.env.COACH_MODEL,
    keys: {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      google: process.env.GOOGLE_API_KEY,
    },
  });
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
  // Second check immediately before the billable network boundary.
  // Protects even other server code that calls this adapter directly.
  if (
    !isApprovedProviderModel(provider.id, provider.model) ||
    typeof provider.apiKey !== "string" ||
    !provider.apiKey.trim()
  ) {
    throw new Error("Coaching provider or model is not approved.");
  }
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
