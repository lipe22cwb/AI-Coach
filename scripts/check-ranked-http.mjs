import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Intentionally public, anonymous, and non-destructive: no cookies, tokens, or
// authenticated game moves. The only POST to match creation must return 401.
export const CASES = [
  {
    name: "Unauthenticated Ranked start",
    method: "POST",
    path: "/api/ranked/matches",
    expected: 401,
  },
  {
    name: "Unauthenticated match recovery",
    method: "GET",
    path: "/api/ranked/matches/current",
    expected: 401,
  },
  {
    name: "Invalid Ranked coordinates",
    method: "POST",
    path: "/api/ranked/matches/reveal",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId: "invalid", row: -1, column: 0 }),
    expected: 400,
  },
  {
    name: "Cross-origin match creation",
    method: "POST",
    path: "/api/ranked/matches",
    headers: { Origin: "https://example.com" },
    expected: 403,
  },
  {
    name: "Cross-origin reveal",
    method: "POST",
    path: "/api/ranked/matches/reveal",
    headers: { Origin: "https://example.com" },
    expected: 403,
  },
  {
    name: "Cross-origin flag",
    method: "POST",
    path: "/api/ranked/matches/flag",
    headers: { Origin: "https://example.com" },
    expected: 403,
  },
  {
    name: "Cross-origin chord",
    method: "POST",
    path: "/api/ranked/matches/chord",
    headers: { Origin: "https://example.com" },
    expected: 403,
  },
  {
    name: "Invalid leaderboard query",
    method: "GET",
    path: "/api/ranked-results?rows=16&columns=16&mines=40",
    expected: 400,
  },
  {
    name: "Verified Ranked leaderboard",
    method: "GET",
    path: "/api/ranked-results?boardSize=16&mineCount=40",
    expected: 200,
    verifyLeaderboard: true,
  },
];

export function localBaseUrl(value) {
  const url = new URL(value);
  // Strictly local: never send these requests to a deployed host.
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Ranked HTTP smoke tests only accept a plain local HTTP origin.");
  }
  return url.origin;
}

export async function checkRankedHttp({
  baseUrl = "http://localhost:3000",
  fetcher = fetch,
} = {}) {
  const base = localBaseUrl(baseUrl);
  const passed = [];

  for (const item of CASES) {
    // Deliberately never set Cookie, Authorization, or credential modes.
    const response = await fetcher(`${base}${item.path}`, {
      method: item.method,
      headers: item.headers ?? {},
      ...(item.body === undefined ? {} : { body: item.body }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status !== item.expected) {
      throw new Error(
        `${item.name}: expected HTTP ${item.expected}, received ${response.status}.`,
      );
    }
    if (!response.headers.get("cache-control")?.includes("no-store")) {
      throw new Error(`${item.name}: response must disable caching.`);
    }

    if (item.verifyLeaderboard) {
      const body = await response.json();
      if (
        body?.mode !== "ranked" ||
        body?.source !== "server-verified" ||
        body?.boardSize !== 16 ||
        body?.mineCount !== 40 ||
        body?.timing !== "server-wall-clock" ||
        !Array.isArray(body?.results)
      ) {
        throw new Error("Verified leaderboard returned an unexpected response shape.");
      }
      // Nonempty results are valid after a real Ranked win; never require [].
    }
    passed.push({ name: item.name, status: response.status });
  }
  return passed;
}

// Unit tests import this module without launching network requests.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkRankedHttp({ baseUrl: process.env.RANKED_HTTP_BASE_URL || undefined })
    .then((passed) => {
      for (const { name, status } of passed) {
        console.log(`PASS HTTP ${status}: ${name}`);
      }
      console.log(
        `${passed.length}/${passed.length} local Ranked HTTP smoke checks passed.`,
      );
    })
    .catch((error) => {
      console.error(`Ranked HTTP smoke test failed: ${error.message}`);
      process.exitCode = 1;
    });
}
