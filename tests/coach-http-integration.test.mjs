import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleCoachPost, handleVerifiedCoachPost } from "../lib/coach/http-handlers.ts";

// These exercise the same Request/Response, origin and streaming body limits as
// production. Authentication, PostgreSQL and the paid AI provider are faked.
const origin = "https://example.test";
function post(endpoint, body, headers = {}) {
  return new Request(`${origin}${endpoint}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const legacyPath = "/api/coach";
const verifiedPath = "/api/coach/verified";

function legacy(overrides = {}) {
  const calls = { validate: 0, quota: 0, provider: 0, reserved: null, input: null };
  const deps = {
    validateSession: (input) => {
      calls.validate++;
      calls.input = input;
      return { session: input };
    },
    reservePaidCoachCall: async () => {
      calls.quota++;
      return false;
    },
    coachGameplay: async (_session, reserved) => {
      calls.reserved = reserved;
      if (reserved) calls.provider++;
      return {
        report: { source: reserved ? "openai" : "rules" },
        fallbackReason: reserved ? null : "rule fallback",
      };
    },
    ...overrides,
  };
  return { deps, calls };
}

const moment = {
  id: "move-4",
  kind: "mistake",
  category: "Unnecessary guess",
  occurrences: 1,
  finding: "One proven finding",
  evidence: "Visible number evidence",
  nextTime: "Check numbers first",
};
const report = { moments: [moment] };
function verified(overrides = {}) {
  const calls = { prepare: 0, quota: 0, provider: 0, getProvider: 0, prompt: null };
  const deps = {
    prepareVerifiedFocusInput: () => {
      calls.prepare++;
      return { ok: true, report };
    },
    reservePaidCoachCall: async () => {
      calls.quota++;
      return false;
    },
    getConfiguredProvider: () => {
      calls.getProvider++;
      return { id: "openai", model: "mock-model", apiKey: "not-a-real-key" };
    },
    requestNarrative: async (_provider, _system, userPrompt) => {
      calls.provider++;
      calls.prompt = JSON.parse(userPrompt);
      return { headline: "move-4", summary: "direct" };
    },
    validateFocusSelection: (r, id, style) =>
      r.moments.some((item) => item.id === id) &&
      (style === "direct" || style === "step-by-step")
        ? { focusId: id, style }
        : null,
    ...overrides,
  };
  return { deps, calls };
}

function checkPrivate(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

test("the real Next.js POST routes use rate limiting and delegate to their handlers", () => {
  const legacyRoute = readFileSync(
    new URL("../app/api/coach/route.ts", import.meta.url),
    "utf8",
  );

  const verifiedRoute = readFileSync(
    new URL("../app/api/coach/verified/route.ts", import.meta.url),
    "utf8",
  );

  // Both routes must check the shared public rate limit first.
  assert.match(legacyRoute, /guardPublicCoachPost\(request, checkPublicCoachRateLimit/);

  assert.match(verifiedRoute, /guardPublicCoachPost\(request, checkPublicCoachRateLimit/);

  // Both routes must still call their original coaching handlers.
  assert.match(legacyRoute, /handleCoachPost\(request,/);
  assert.match(verifiedRoute, /handleVerifiedCoachPost\(request,/);
});

test("legacy guest: HTTP 200 with rule report, never provider", async () => {
  const { deps, calls } = legacy();
  const response = await handleCoachPost(post(legacyPath, { test: true }), deps);
  assert.equal(response.status, 200);
  checkPrivate(response);
  assert.equal((await response.json()).report.source, "rules");
  assert.equal(calls.provider, 0);
  assert.equal(calls.reserved, false);
  assert.deepEqual(calls.input, { test: true });
});

test("legacy with verified reservation: provider may run", async () => {
  const { deps, calls } = legacy({ reservePaidCoachCall: async () => true });
  const result = await handleCoachPost(post(legacyPath, { test: true }), deps);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).report.source, "openai");
  assert.equal(calls.provider, 1);
  assert.equal(calls.reserved, true);
});

test("legacy invalid game: rejects before quota or provider", async () => {
  const { deps, calls } = legacy({
    validateSession: () => ({ error: "Invalid game." }),
  });
  const response = await handleCoachPost(post(legacyPath, { test: true }), deps);
  assert.equal(response.status, 400);
  checkPrivate(response);
  assert.equal((await response.json()).error, "Invalid game.");
  assert.equal(calls.quota, 0);
  assert.equal(calls.provider, 0);
});

test("legacy cross-origin POST: HTTP 403 before any paid work", async () => {
  const { deps, calls } = legacy();
  const response = await handleCoachPost(
    post(legacyPath, {}, { origin: "https://attacker.invalid" }),
    deps,
  );
  assert.equal(response.status, 403);
  assert.equal(calls.validate, 0);
  assert.equal(calls.quota, 0);
});

test("legacy wrong content type is rejected without billing", async () => {
  const { deps, calls } = legacy();
  const response = await handleCoachPost(
    post(legacyPath, "{}", { "content-type": "text/plain" }),
    deps,
  );
  assert.equal(response.status, 415);
  assert.equal(calls.quota, 0);
});

test("legacy malformed JSON is rejected without billing", async () => {
  const { deps, calls } = legacy();
  const response = await handleCoachPost(post(legacyPath, "{invalid-json"), deps);
  assert.equal(response.status, 400);
  assert.equal(calls.quota, 0);
});

test("legacy streamed body >100 KB stops before validation and quota", async () => {
  const { deps, calls } = legacy();
  const response = await handleCoachPost(
    post(legacyPath, JSON.stringify({ payload: "x".repeat(100_000) })),
    deps,
  );
  assert.equal(response.status, 413);
  assert.equal(calls.validate, 0);
  assert.equal(calls.quota, 0);
});

test("verified guest: rule selection without a provider call", async () => {
  const { deps, calls } = verified();
  const response = await handleVerifiedCoachPost(
    post(verifiedPath, { game: "practice" }),
    deps,
  );
  assert.equal(response.status, 200);
  checkPrivate(response);
  const json = await response.json();
  assert.equal(json.selectedBy, "rules");
  assert.equal(json.focusId, "move-4");
  assert.equal(calls.provider, 0);
  assert.equal(calls.getProvider, 0);
});

test("verified invalid replay returns 422 without reserving quota", async () => {
  const { deps, calls } = verified({
    prepareVerifiedFocusInput: () => ({
      ok: false,
      status: 422,
      error: "Replay mismatch",
    }),
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "Replay mismatch");
  assert.equal(calls.quota, 0);
});

test("verified zero findings skips quota and AI", async () => {
  const { deps, calls } = verified({
    prepareVerifiedFocusInput: () => ({ ok: true, report: { moments: [] } }),
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal((await response.json()).focusId, null);
  assert.equal(calls.quota, 0);
  assert.equal(calls.provider, 0);
});

test("verified valid reservation: model only receives approved moment facts", async () => {
  const { deps, calls } = verified({ reservePaidCoachCall: async () => true });
  const response = await handleVerifiedCoachPost(
    post(verifiedPath, { untrusted: "INJECT THIS INTO AI", mines: [1, 2] }),
    deps,
  );
  const result = await response.json();
  assert.equal(result.selectedBy, "openai");
  assert.equal(result.focusId, "move-4");
  assert.equal(result.style, "direct");
  assert.equal(calls.provider, 1);
  assert.deepEqual(calls.prompt.available, [
    {
      id: moment.id,
      kind: moment.kind,
      category: moment.category,
      occurrences: moment.occurrences,
      what: moment.finding,
      proof: moment.evidence,
      advice: moment.nextTime,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(calls.prompt), /INJECT THIS INTO AI|"mines"/);
});

test("verified quota denied: skip provider lookup and request", async () => {
  const { deps, calls } = verified({ reservePaidCoachCall: async () => false });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal((await response.json()).selectedBy, "rules");
  assert.equal(calls.getProvider, 0);
  assert.equal(calls.provider, 0);
});

test("verified missing provider after reservation still falls back safely", async () => {
  const { deps, calls } = verified({
    reservePaidCoachCall: async () => true,
    getConfiguredProvider: () => null,
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal((await response.json()).selectedBy, "rules");
  assert.equal(calls.provider, 0);
});

test("verified AI invented focus ID is rejected", async () => {
  const { deps, calls } = verified({
    reservePaidCoachCall: async () => true,
    requestNarrative: async () => {
      calls.provider++;
      return { headline: "fabricated-move", summary: "direct" };
    },
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal((await response.json()).selectedBy, "rules");
  assert.equal(calls.provider, 1);
});

test("verified AI invalid style is rejected", async () => {
  const { deps } = verified({
    reservePaidCoachCall: async () => true,
    requestNarrative: async () => ({ headline: "move-4", summary: "superhuman" }),
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal((await response.json()).selectedBy, "rules");
});

test("verified provider failure exposes no upstream error and returns rules", async () => {
  const { deps } = verified({
    reservePaidCoachCall: async () => true,
    requestNarrative: async () => {
      throw new Error("SECRET_PROVIDER_ERROR_do_not_expose");
    },
  });
  const response = await handleVerifiedCoachPost(post(verifiedPath, {}), deps);
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /SECRET_PROVIDER_ERROR/);
});

test("verified cross-site POST rejects before replay and quota", async () => {
  const { deps, calls } = verified();
  const response = await handleVerifiedCoachPost(
    post(verifiedPath, {}, { origin: "https://attacker.invalid" }),
    deps,
  );
  assert.equal(response.status, 403);
  assert.equal(calls.prepare, 0);
  assert.equal(calls.quota, 0);
});

test("verified request exceeding 200 KB rejects before replay and quota", async () => {
  const { deps, calls } = verified();
  const response = await handleVerifiedCoachPost(
    post(verifiedPath, { payload: "x".repeat(200_000) }),
    deps,
  );
  assert.equal(response.status, 413);
  assert.equal(calls.prepare, 0);
  assert.equal(calls.quota, 0);
});
