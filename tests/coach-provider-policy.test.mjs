import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVED_COACH_MODELS,
  isApprovedProviderModel,
  resolveApprovedProvider,
} from "../lib/coach/provider-policy.ts";

const allKeys = {
  openai: "fake-openai-key",
  anthropic: "fake-anthropic-key",
  gemini: "fake-gemini-key",
};

function pick(provider, model, keys = allKeys) {
  return resolveApprovedProvider({ provider, model, keys });
}

test("no explicit provider means no paid calls even with keys", () => {
  assert.equal(pick(undefined, undefined), null);
  assert.equal(pick("", undefined), null);
});

test("unknown provider never silently falls back to a configured key", () => {
  assert.equal(pick("expensive-provider", undefined), null);
  assert.equal(pick("open-ai", undefined), null);
});

test("prototype property names cannot select a provider", () => {
  assert.equal(pick("constructor", undefined), null);
  assert.equal(pick("__proto__", undefined), null);
});

test("OpenAI uses only its approved small model", () => {
  assert.deepEqual(pick("openai", undefined), {
    id: "openai",
    apiKey: "fake-openai-key",
    model: "gpt-4o-mini",
  });
});

test("Anthropic uses only its approved small model", () => {
  assert.deepEqual(pick("anthropic", undefined), {
    id: "anthropic",
    apiKey: "fake-anthropic-key",
    model: "claude-haiku-4-5",
  });
});

test("Gemini uses only its approved flash model", () => {
  assert.deepEqual(pick("gemini", undefined), {
    id: "gemini",
    apiKey: "fake-gemini-key",
    model: "gemini-2.5-flash",
  });
});

test("explicitly approved model override is allowed", () => {
  assert.equal(pick("openai", "gpt-4o-mini")?.model, "gpt-4o-mini");
});

test("unknown or expensive OpenAI model is denied", () => {
  assert.equal(pick("openai", "gpt-4o"), null);
  assert.equal(pick("openai", "gpt-5"), null);
});

test("cross-provider model mismatch is denied", () => {
  assert.equal(pick("openai", "claude-haiku-4-5"), null);
  assert.equal(pick("anthropic", "gemini-2.5-flash"), null);
  assert.equal(pick("gemini", "gpt-4o-mini"), null);
});

test("blank explicit model override does not silently use the default", () => {
  assert.equal(pick("openai", ""), null);
  assert.equal(pick("openai", "   "), null);
});

test("unavailable selected provider never uses another provider's key", () => {
  assert.equal(pick("openai", undefined, { anthropic: "fake-key" }), null);
  assert.equal(pick("gemini", undefined, { openai: "fake-key" }), null);
});

test("a blank selected provider key fails closed", () => {
  assert.equal(pick("openai", undefined, { openai: "  " }), null);
  assert.equal(pick("anthropic", undefined, { anthropic: "" }), null);
});

test("Gemini supports existing legacy Google key as the same provider", () => {
  assert.equal(
    pick("gemini", undefined, { google: "fake-google-key" })?.apiKey,
    "fake-google-key",
  );
});

test("no default selection when paid keys for all providers are present", () => {
  assert.equal(pick(undefined, undefined, allKeys), null);
});

test("provider names tolerate whitespace and case only", () => {
  assert.equal(pick(" OPENAI ", undefined)?.id, "openai");
});

test("allowlist matches the reviewed per-provider model exactly", () => {
  assert.deepEqual(APPROVED_COACH_MODELS, {
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-4-5",
    gemini: "gemini-2.5-flash",
  });
  assert.equal(isApprovedProviderModel("openai", "gpt-4o-mini"), true);
  assert.equal(isApprovedProviderModel("openai", "Gpt-4o-mini"), false);
  assert.equal(isApprovedProviderModel("not-a-provider", "gpt-4o-mini"), false);
});

test("production resolver is wired to policy and outbound calls recheck it", () => {
  const source = readFileSync(
    new URL("../lib/coach/providers.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /return resolveApprovedProvider\(/);
  assert.match(source, /!isApprovedProviderModel\(provider\.id, provider\.model\)/);
});
