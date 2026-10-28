// HTTP checks for the server-controlled Ranked-results endpoint.
// Run npm run dev, then: node scripts/smoke-secure-ranked-results.mjs
// Optional: node scripts/smoke-secure-ranked-results.mjs http://localhost:3001
import assert from "node:assert/strict";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = `${base}/api/ranked-results`;

async function jsonRequest(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  return { response, data };
}

async function main() {
  let checks = 0;
  const invalid = await jsonRequest(`${url}?boardSize=9&mineCount=10`);
  assert.equal(invalid.response.status, 400);
  checks++;
  console.log("PASS Invalid board parameters rejected");

  const forged = await jsonRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      gameId: "claimed-game-id-001",
      playerName: "Fake Player",
      boardSize: 16,
      mineCount: 40,
      durationMs: 1,
      outcome: "win",
    }),
  });
  assert.ok([401, 503].includes(forged.response.status), JSON.stringify(forged));
  checks++;
  console.log(`PASS Forged win rejected (${forged.response.status})`);

  const foreign = await jsonRequest(url, {
    method: "POST",
    headers: { Origin: "https://untrusted.example" },
    body: "{}",
  });
  assert.equal(foreign.response.status, 403);
  checks++;
  console.log("PASS Cross-origin result submission rejected");

  const leaderboard = await jsonRequest(`${url}?boardSize=16&mineCount=40`);
  assert.ok([200, 503].includes(leaderboard.response.status));
  if (leaderboard.response.status === 200) {
    assert.equal(leaderboard.data.source, "server-verified");
    assert.equal(leaderboard.data.timing, "server-wall-clock");
    assert.ok(Array.isArray(leaderboard.data.results));
    assert.ok(leaderboard.data.results.length <= 50);
    for (const entry of leaderboard.data.results) {
      assert.deepEqual(
        Object.keys(entry).sort(),
        ["rank", "durationMs", "finishedAt"].sort(),
      );
    }
    console.log("PASS Verified leaderboard read (200)");
  } else {
    assert.equal(typeof leaderboard.data.error, "string");
    console.log("PASS Database unavailable: leaderboard safely disabled (503)");
  }
  checks++;
  console.log(
    `${checks}/4 smoke checks passed. This does NOT verify the database triggers.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
