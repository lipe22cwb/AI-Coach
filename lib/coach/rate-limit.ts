// A small in-memory rate limiter for the coaching endpoint.
//
// It is deliberately dependency-free and per-process: enough to stop a runaway
// client from burning AI credits during a demo, not a replacement for a shared
// limiter (Redis/Upstash) in a multi-instance deployment. The limit applies to
// POST only; the GET status check stays free.

export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TRACKED_CLIENTS = 5000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

function prune(now: number) {
  if (buckets.size <= MAX_TRACKED_CLIENTS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  clientKey: string,
  now: number = Date.now(),
  limit: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS,
): RateLimitResult {
  prune(now);
  const current = buckets.get(clientKey);
  if (!current || current.resetAt <= now) {
    buckets.set(clientKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(0, current.resetAt - now) };
  }
  current.count += 1;
  return { allowed: true };
}

/** Test helper: forget every tracked client. */
export function resetRateLimit() {
  buckets.clear();
}

/** Best-effort client identity for the limiter. */
export function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "local";
}
