import assert from "node:assert/strict";
import test from "node:test";
import { reservePaidCoachCallWith } from "../lib/coach/paid-access-core.ts";

const VERIFIED_ID = "test-user-from-verified-session";

function fakeGate(overrides = {}) {
  const calls = { auth: 0, quota: 0, userId: null };
  const gate = {
    enabled: true,
    providerConfigured: true,
    verifiedUserId: async () => {
      calls.auth++;
      return VERIFIED_ID;
    },
    reserveQuota: async (userId) => {
      calls.quota++;
      calls.userId = userId;
      return true;
    },
    ...overrides,
  };
  return { gate, calls };
}

test("paid AI disabled: no authentication or quota call", async () => {
  const { gate, calls } = fakeGate({ enabled: false });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.auth, 0);
  assert.equal(calls.quota, 0);
});

test("missing provider: no authentication or quota call", async () => {
  const { gate, calls } = fakeGate({ providerConfigured: false });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.auth, 0);
  assert.equal(calls.quota, 0);
});

test("verified user and allowed quota admit a paid request", async () => {
  const { gate, calls } = fakeGate();
  assert.equal(await reservePaidCoachCallWith(gate), true);
  assert.equal(calls.auth, 1);
  assert.equal(calls.quota, 1);
  assert.equal(calls.userId, VERIFIED_ID);
});

test("guest is denied without a quota reservation", async () => {
  const { gate, calls } = fakeGate({ verifiedUserId: async () => null });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.quota, 0);
});

test("empty user ID cannot reserve quota", async () => {
  const { gate, calls } = fakeGate({ verifiedUserId: async () => "" });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.quota, 0);
});

test("exhausted quota denies paid access", async () => {
  const { gate, calls } = fakeGate({ reserveQuota: async () => false });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.auth, 1);
});

test("authentication outage fails closed", async () => {
  const { gate, calls } = fakeGate({
    verifiedUserId: async () => {
      throw new Error("Auth unavailable - sensitive detail");
    },
  });
  assert.equal(await reservePaidCoachCallWith(gate), false);
  assert.equal(calls.quota, 0);
});

test("database outage fails closed", async () => {
  const { gate } = fakeGate({
    reserveQuota: async () => {
      throw new Error("Database offline - sensitive detail");
    },
  });
  assert.equal(await reservePaidCoachCallWith(gate), false);
});

test("undefined-like quota response never grants access", async () => {
  const { gate } = fakeGate({ reserveQuota: async () => undefined });
  assert.equal(await reservePaidCoachCallWith(gate), false);
});

test("truthy non-boolean quota response never grants access", async () => {
  const { gate } = fakeGate({ reserveQuota: async () => "true" });
  assert.equal(await reservePaidCoachCallWith(gate), false);
});

test("mock paid provider is never invoked after denied reservation", async () => {
  let providerCalls = 0;
  const { gate } = fakeGate({ reserveQuota: async () => false });
  const authorized = await reservePaidCoachCallWith(gate);
  const fallback = { source: "rules" };
  const result = authorized
    ? await (async () => {
        providerCalls++;
        return { source: "paid-provider" };
      })()
    : fallback;
  assert.deepEqual(result, fallback);
  assert.equal(providerCalls, 0);
});

test("mock paid provider can run after verified authorization and quota", async () => {
  let providerCalls = 0;
  const { gate } = fakeGate();
  const authorized = await reservePaidCoachCallWith(gate);
  const result = authorized
    ? await (async () => {
        providerCalls++;
        return { source: "paid-provider" };
      })()
    : { source: "rules" };
  assert.equal(result.source, "paid-provider");
  assert.equal(providerCalls, 1);
});
