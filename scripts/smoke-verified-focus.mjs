// Live HTTP checks for /api/coach/verified, WITHOUT contacting an AI provider.
// Run Next.js first, then: node scripts/smoke-verified-focus.mjs
// Optional base URL: node scripts/smoke-verified-focus.mjs http://localhost:3001

import assert from "node:assert/strict";
import { referenceGame, action } from "../tests/helpers/reference-practice.mjs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/api/coach/verified`;
const fixture = referenceGame({
  rows: 2,
  columns: 3,
  mines: [0, 2],
  actions: [
    action(1, 0, "reveal"),
    action(1, 1, "reveal"),
    action(1, 2, "reveal"),
    action(0, 0, "reveal"),
  ],
}).recording;

async function check(name, status, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${name}: server returned invalid JSON`);
  }
  assert.equal(response.status, status, `${name}: ${JSON.stringify(data)}`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  console.log(`PASS ${status} ${name}`);
  return data;
}

async function main() {
  const stateResponse = await fetch(`${base}/api/coach`, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(stateResponse.ok, true, "Could not read coaching provider status");
  const state = await stateResponse.json();
  if (state.configured) {
    console.log(
      "Skipped: an AI provider is configured. This test will not trigger a billable API call.",
    );
    console.log(
      "Run the test in a rules-only local environment to verify the live focus endpoint.",
    );
    return;
  }

  const valid = await check("valid completed Practice recording", 200, fixture);
  assert.equal(valid.selectedBy, "rules");
  assert.match(valid.focusId ?? "", /^move-\d+$/);
  assert.equal(Object.hasOwn(valid, "mines"), false);
  assert.equal(Object.hasOwn(valid, "moves"), false);

  const missingHash = structuredClone(fixture);
  delete missingHash.moves[0].afterHash;
  await check("missing checkpoint", 400, missingHash);

  const wrongHash = structuredClone(fixture);
  wrongHash.moves[0].afterHash = "deadbeef";
  await check("mismatched visible checkpoint", 422, wrongHash);

  await check("contradictory outcome", 422, { ...fixture, outcome: "win" });
  await check("ranked game rejected", 400, { ...fixture, game: "ranked" });
  await check("malformed JSON", 400, "{not-json");
  await check("cross-origin request rejected", 403, fixture, {
    origin: "https://untrusted.example",
  });
  await check("oversized input", 413, JSON.stringify({ padding: "x".repeat(200_050) }));

  console.log("8/8 verified-focus HTTP checks passed. No AI provider was contacted.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
