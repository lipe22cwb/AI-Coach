/** Pure decision boundary for billable Coaching requests.
 *
 * Dependencies are injected so authentication, quotas and outages can be
 * tested without Supabase credentials or a real AI provider.
 */
export type PaidCoachGate = {
  enabled: boolean;
  providerConfigured: boolean;
  verifiedUserId: () => Promise<string | null>;
  reserveQuota: (userId: string) => Promise<boolean>;
};

export async function reservePaidCoachCallWith(gate: PaidCoachGate): Promise<boolean> {
  // Never attempt to authenticate or reserve quota when paid access is off.
  if (!gate.enabled || !gate.providerConfigured) return false;

  try {
    const userId = await gate.verifiedUserId();
    if (!userId) return false;

    // Only a literal true grants access; false, null-like results and errors deny.
    return (await gate.reserveQuota(userId)) === true;
  } catch {
    // Auth/configuration/database failures must not produce billable calls.
    return false;
  }
}
