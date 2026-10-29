import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkPublicRateLimitWith } from "./public-rate-limit-core";

// Optional staging-first global admission guard for ALL public Coaching POSTs.
// This limits aggregate work across server instances, not individual clients.
export async function checkPublicCoachRateLimit() {
  return checkPublicRateLimitWith({
    enabled: process.env.COACH_PUBLIC_RATE_LIMIT_ENABLED === "true",
    reserve: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("reserve_public_coach_request");
      if (error) {
        console.error(
          "Public Coaching rate-limit unavailable:",
          error.code ?? "rpc_error",
        );
        throw new Error("Rate-limit database unavailable");
      }
      return data;
    },
  });
}
