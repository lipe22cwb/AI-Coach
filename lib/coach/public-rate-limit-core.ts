// Pure rate-limit decision: all instances share the same database reservation.
// No request IPs, forwarded headers, or caller-owned IDs are trusted here.
export type PublicRateDecision = "allow" | "limited" | "unavailable";

export async function checkPublicRateLimitWith(settings: {
  enabled: boolean;
  reserve: () => Promise<unknown>;
}): Promise<PublicRateDecision> {
  if (!settings.enabled) return "allow";
  try {
    const result = await settings.reserve();
    if (result === true) return "allow";
    if (result === false) return "limited";
    return "unavailable"; // Unexpected DB responses must not authorize work.
  } catch {
    return "unavailable"; // Fail closed on database/configuration outages.
  }
}
