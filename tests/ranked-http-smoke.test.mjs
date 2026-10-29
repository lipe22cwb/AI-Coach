import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES, checkRankedHttp, localBaseUrl } from "../scripts/check-ranked-http.mjs";

function fakeFetch(overrides = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    const item = CASES[requests.length - 1];
    const status = overrides[item.name] ?? item.expected;
    return new Response(
      JSON.stringify(
        item.verifyLeaderboard
          ? {
              mode: "ranked",
              source: "server-verified",
              boardSize: 16,
              mineCount: 40,
              timing: "server-wall-clock",
              results: [],
            }
          : { error: "Rejected as intended" },
      ),
      {
        status,
        headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
      },
    );
  };
  return { fetcher, requests };
}

test("HTTP smoke target is limited to local HTTP with no credentials", () => {
  assert.equal(localBaseUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(localBaseUrl("http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  for (const url of [
    "https://localhost:3000",
    "http://example.com",
    "http://localhost:3000/other",
    "http://user:pass@localhost:3000",
    "http://localhost:3000/?token=secret",
    "http://localhost:3000/#test",
  ]) {
    assert.throws(() => localBaseUrl(url));
  }
});

test("smoke checks use only anonymous, local requests and never submit a game result", async () => {
  const { fetcher, requests } = fakeFetch();
  const passed = await checkRankedHttp({ fetcher });
  assert.equal(passed.length, CASES.length);
  assert.ok(requests.every(({ url }) => url.startsWith("http://localhost:3000/")));
  assert.ok(requests.every(({ options }) => options.redirect === "manual"));
  assert.ok(
    requests.every(({ options }) =>
      Object.keys(options.headers).every((key) => !/^(cookie|authorization)$/i.test(key)),
    ),
  );
  assert.ok(requests.every(({ url }) => !url.includes("/auth/")));
  assert.ok(
    requests.every(
      ({ url, options }) =>
        !url.includes("/api/ranked-results") || options.method === "GET",
    ),
  );
  assert.ok(CASES.some((item) => item.path.includes("boardSize=16&mineCount=40")));
});

test("smoke checks fail when an authorization boundary returns an unexpected status", async () => {
  const { fetcher } = fakeFetch({ "Unauthenticated Ranked start": 200 });
  await assert.rejects(checkRankedHttp({ fetcher }), /expected HTTP 401, received 200/);
});

test("smoke checks reject an invalid or unverified leaderboard shape", async () => {
  const fetcher = async (_url, _options) => {
    const index = fetcher.count++;
    const item = CASES[index];
    return new Response(
      JSON.stringify(
        item.verifyLeaderboard
          ? {
              mode: "ranked",
              source: "unverified",
              boardSize: 16,
              mineCount: 40,
              results: [],
            }
          : {},
      ),
      { status: item.expected, headers: { "Cache-Control": "no-store" } },
    );
  };
  fetcher.count = 0;
  await assert.rejects(checkRankedHttp({ fetcher }), /unexpected response shape/);
});

test("smoke checks require no-store responses", async () => {
  const fetcher = async () => new Response("{}", { status: 401 });
  await assert.rejects(checkRankedHttp({ fetcher }), /must disable caching/);
});
