import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/sever";
import { reservePaidCoachCallWith } from "./paid-access-core";
import { getConfiguredProvider } from "./providers";

// Fail closed. A configured provider key alone NEVER authorizes a billable call.
// The same atomic PostgreSQL reservation is used by both paid Coaching routes.
export async function reservePaidCoachCall(): Promise<boolean> {
  return reservePaidCoachCallWith({
    enabled: process.env.COACH_PAID_AI_ENABLED === "true",
    providerConfigured: getConfiguredProvider() !== null,
    verifiedUserId: async () => {
      const client = await createClient();
      const { data, error } = await client.auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
    reserveQuota: async (userId) => {
      // Never accept a user ID or quota key from browser JSON or headers.
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("reserve_coach_ai_request", {
        p_user_id: userId,
      });
      if (error) {
        console.error("Paid Coaching quota unavailable:", error.code ?? "rpc_error");
        return false;
      }
      return data === true;
    },
  });
}
