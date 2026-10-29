// Security helpers for browser-facing Coaching API endpoints.
// No dependency on Next.js or on provider SDKs; can be regression-tested with Node.

export const COACH_MAX_BODY_BYTES = 100_000;
export const VERIFIED_MAX_BODY_BYTES = 200_000;

type ReadResult = { ok: true; value: unknown } | { ok: false; response: Response };

function errorResponse(message: string, status: number): ReadResult {
  return {
    ok: false,
    response: Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    ),
  };
}

// The browser must not spend a user's session on another site's POST.
export function isAllowedCoachOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

// Limit bytes *while reading*. A missing or forged Content-Length header cannot
// bypass the cap, and we never buffer more than maxBytes before returning 413.
export async function readLimitedCoachJson(
  request: Request,
  maxBytes: number,
): Promise<ReadResult> {
  if (!isAllowedCoachOrigin(request))
    return errorResponse("Invalid request origin.", 403);

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    return errorResponse("Send a JSON request body.", 415);
  }

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared))) {
      return errorResponse("Invalid Content-Length header.", 400);
    }
    if (Number(declared) > maxBytes) {
      return errorResponse("Request body is too large.", 413);
    }
  }

  if (!request.body) return errorResponse("A JSON request body is required.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return errorResponse("Request body is too large.", 413);
      }
      chunks.push(value);
    }
  } catch {
    return errorResponse("Could not read the request body.", 400);
  } finally {
    reader.releaseLock();
  }

  if (!total) return errorResponse("A JSON request body is required.", 400);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return errorResponse("The request body must be valid UTF-8 JSON.", 400);
  }
}
