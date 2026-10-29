import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkPublicRateLimitWith } from "../lib/coach/public-rate-limit-core.ts";
import { guardPublicCoachPost } from "../lib/coach/public-rate-guard.ts";

const request = (origin = "https://example.test") =>
  new Request("https://example.test/api/coach", {
    method: "POST",
    headers: { origin },
  });
const proceed = async () => Response.json({ ok: true });

test("default disabled: allows free coaching without database access", async () => {
  let calls = 0;
  assert.equal(
    await checkPublicRateLimitWith({
      enabled: false,
      reserve: async () => {
        calls++;
        return false;
      },
    }),
    "allow",
  );
  assert.equal(calls, 0);
});

test("an approved global reservation permits analysis", async () => {
  assert.equal(
    await checkPublicRateLimitWith({ enabled: true, reserve: async () => true }),
    "allow",
  );
});

test("an exhausted global bucket denies analysis", async () => {
  assert.equal(
    await checkPublicRateLimitWith({ enabled: true, reserve: async () => false }),
    "limited",
  );
});

test("an unavailable backend never authorizes expensive analysis", async () => {
  assert.equal(
    await checkPublicRateLimitWith({
      enabled: true,
      reserve: async () => {
        throw new Error("db down");
      },
    }),
    "unavailable",
  );
});

test("an invalid truthy database response must not authorize analysis", async () => {
  assert.equal(
    await checkPublicRateLimitWith({ enabled: true, reserve: async () => "true" }),
    "unavailable",
  );
});

test("a null database response is treated as unavailable", async () => {
  assert.equal(
    await checkPublicRateLimitWith({ enabled: true, reserve: async () => null }),
    "unavailable",
  );
});

test("HTTP 429 is returned with Retry-After and no-store, without analysis", async () => {
  let invoked = 0;
  const response = await guardPublicCoachPost(
    request(),
    async () => "limited",
    async () => {
      invoked++;
      return proceed();
    },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(invoked, 0);
});

test("HTTP 503 on database outage and no analysis", async () => {
  let invoked = 0;
  const response = await guardPublicCoachPost(
    request(),
    async () => "unavailable",
    async () => {
      invoked++;
      return proceed();
    },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(invoked, 0);
});

test("a thrown rate-limit check fails closed", async () => {
  const response = await guardPublicCoachPost(
    request(),
    async () => {
      throw new Error("db detail");
    },
    proceed,
  );
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /db detail/);
});

test("invalid cross-origin request is denied before database access", async () => {
  let checks = 0;
  const response = await guardPublicCoachPost(
    request("https://attacker.example"),
    async () => {
      checks++;
      return "allow";
    },
    proceed,
  );
  assert.equal(response.status, 403);
  assert.equal(checks, 0);
});

test("a valid allowed request proceeds to its original handler once", async () => {
  let calls = 0;
  const response = await guardPublicCoachPost(
    request(),
    async () => "allow",
    async () => {
      calls++;
      return proceed();
    },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test("all three real POST routes call the same shared guard", () => {
  for (const route of [
    "../app/api/coach/route.ts",
    "../app/api/coach/verified/route.ts",
    "../app/api/coach/verified-brief/route.ts",
  ]) {
    const content = readFileSync(new URL(route, import.meta.url), "utf8");
    assert.match(content, /guardPublicCoachPost\(request, checkPublicCoachRateLimit/);
  }
});

test("SQL template uses an atomic upsert and only server-side role may call it", () => {
  const sql = readFileSync(
    new URL("../scripts/sql/public-coach-global-rate-limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /on conflict \(bucket_start\) do update/i);
  assert.match(sql, /where c\.usage_count < 120/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /grant execute on function public\.reserve_public_coach_request\(\) to service_role/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.reserve_public_coach_request\(\) from public, anon, authenticated/i,
  );
});
