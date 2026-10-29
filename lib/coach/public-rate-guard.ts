import { isAllowedCoachOrigin } from "./http-security.ts";
import type { PublicRateDecision } from "./public-rate-limit-core";

const noStore = { "Cache-Control": "no-store" };

/** All three production Coaching POST routes must call this *before* analysis. */
export async function guardPublicCoachPost(
  request: Request,
  check: () => Promise<PublicRateDecision>,
  proceed: () => Promise<Response>,
): Promise<Response> {
  // Preserve the existing early origin rejection without hitting PostgreSQL.
  if (!isAllowedCoachOrigin(request)) {
    return Response.json(
      { error: "Invalid request origin." },
      { status: 403, headers: noStore },
    );
  }

  let decision: PublicRateDecision;
  try {
    decision = await check();
  } catch {
    decision = "unavailable";
  }

  if (decision === "limited") {
    return Response.json(
      { error: "Coaching is receiving too many requests. Please try again shortly." },
      { status: 429, headers: { ...noStore, "Retry-After": "60" } },
    );
  }
  if (decision !== "allow") {
    return Response.json(
      { error: "Coaching is temporarily unavailable." },
      { status: 503, headers: { ...noStore, "Retry-After": "5" } },
    );
  }
  return proceed();
}
