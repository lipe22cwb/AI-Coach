import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedCoachOrigin,
  readLimitedCoachJson,
} from "../lib/coach/http-security.ts";

const target = "https://example.test/api/coach";
function post(body, headers = {}) {
  return new Request(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      ...headers,
    },
    body,
    duplex: "half",
  });
}

test("valid JSON is parsed without changing the data", async () => {
  const result = await readLimitedCoachJson(post('{"moves":[1,2]}'), 100);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { moves: [1, 2] });
});

test("cross-site requests are rejected before processing", async () => {
  const request = post("{}", { origin: "https://attacker.example" });
  assert.equal(isAllowedCoachOrigin(request), false);
  const result = await readLimitedCoachJson(request, 100);
  assert.equal(result.response.status, 403);
});

test("cross-site fetch metadata is also rejected without Origin", async () => {
  const req = post("{}", { origin: "", "sec-fetch-site": "cross-site" });
  assert.equal(isAllowedCoachOrigin(req), false);
});

test("wrong content type is rejected", async () => {
  const r = await readLimitedCoachJson(post("{}", { "content-type": "text/plain" }), 100);
  assert.equal(r.response.status, 415);
});

test("a declared oversized request is rejected", async () => {
  const r = await readLimitedCoachJson(post("{}", { "content-length": "999" }), 10);
  assert.equal(r.response.status, 413);
});

test("an untrusted undersized Content-Length cannot bypass streamed byte cap", async () => {
  const data = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"a":"'));
      controller.enqueue(new Uint8Array(20).fill(88));
      controller.close();
    },
  });
  const r = await readLimitedCoachJson(post(data, { "content-length": "3" }), 10);
  assert.equal(r.response.status, 413);
});

test("multibyte UTF-8 is counted in bytes, not characters", async () => {
  const r = await readLimitedCoachJson(post(JSON.stringify({ x: "é" })), 9);
  assert.equal(r.response.status, 413);
});

test("malformed JSON returns a safe client error", async () => {
  const r = await readLimitedCoachJson(post("{no"), 100);
  assert.equal(r.response.status, 400);
});

test("empty body returns a safe client error", async () => {
  const r = await readLimitedCoachJson(post(""), 100);
  assert.equal(r.response.status, 400);
});

test("malformed Content-Length is rejected", async () => {
  const r = await readLimitedCoachJson(post("{}", { "content-length": "2x" }), 100);
  assert.equal(r.response.status, 400);
});
