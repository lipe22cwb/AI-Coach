// Phase 7 HTTP smoke test for the running Next.js server.
// Run `npm run dev` in one terminal, then run:
//   node scripts/smoke-verified-brief.mjs
// Optionally supply a URL: node scripts/smoke-verified-brief.mjs http://localhost:3001
// This tests the REAL /api/coach/verified-brief route, not a mock endpoint.
// It uses generated Practice fixtures and never requires an AI API key.

import assert from "node:assert/strict";
import { referenceGame, action } from "../tests/helpers/reference-practice.mjs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/api/coach/verified-brief`;
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
});

async function postJson(body) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
}

async function check(label, expectedStatus, body, verify = async () => {}) {
  const response = await postJson(body);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${label}: server returned non-JSON: ${text.slice(0, 200)}`);
  }
  assert.equal(response.status, expectedStatus, `${label}: ${JSON.stringify(data)}`);
  await verify(data, response);
  console.log(`PASS ${String(expectedStatus)} ${label}`);
}

async function main() {
  console.log(`Checking ${url}`);
  await check("verified completed game", 200, fixture.recording, (brief, response) => {
    assert.equal(brief.kind, "verified-practice-coaching-brief");
    assert.equal(brief.schemaVersion, "1");
    assert.equal(brief.game.outcome, "loss");
    assert.equal(brief.analysis.recordedActions, 4);
    assert.equal(brief.game.mode, "practice");
    assert.equal(brief.analysis.verifiedMistakes > 0, true);
    assert.ok(Array.isArray(brief.moments) && brief.moments.length <= 5);
    assert.deepEqual(
      brief.allowedFocusIds,
      brief.moments.map((moment) => moment.id),
    );
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    const serialized = JSON.stringify(brief);
    assert.equal(Object.prototype.hasOwnProperty.call(brief, "moves"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(brief, "mines"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(brief.game, "mines"), false);
    assert.equal(serialized.includes("afterHash"), false);
  });

  await check("invalid JSON", 400, "{not valid JSON", (data) => {
    assert.equal(typeof data.error, "string");
  });

  await check("Ranked data excluded from Practice brief", 400, {
    ...fixture.recording,
    game: "ranked",
  });

  const noStamp = structuredClone(fixture.recording);
  delete noStamp.moves[0].afterHash;
  await check("missing move checkpoint", 400, noStamp);

  const wrongHash = structuredClone(fixture.recording);
  wrongHash.moves[0].afterHash = "deadbeef";
  await check("incorrect replay checksum", 422, wrongHash);

  await check("claimed outcome disagrees with replay", 422, {
    ...fixture.recording,
    outcome: "win",
  });

  await check(
    "oversized request rejected",
    413,
    JSON.stringify({ payload: "x".repeat(200_050) }),
  );

  console.log("7/7 HTTP checks passed. The AI provider was not contacted.");
}

main().catch((error) => {
  if (error?.cause?.code === "ECONNREFUSED" || error?.code === "ECONNREFUSED") {
    console.error(`Cannot reach ${base}. Start the app with 'npm run dev' first.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
