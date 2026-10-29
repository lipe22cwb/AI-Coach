import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/sever";
import { getConfiguredProvider } from "./providers";

// Fail closed. A configured provider key alone NEVER authorizes a billable call.
// The same atomic PostgreSQL reservation is used by both paid Coaching routes.
export async function reservePaidCoachCall(): Promise<boolean> {
  if (process.env.COACH_PAID_AI_ENABLED !== "true" || !getConfiguredProvider()) {
    return false;
  }

  try {
    const client = await createClient();
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) return false;

    // Never accept the user ID or quota key from browser-supplied JSON/headers.
    const admin = createAdminClient();
    const { data: reserved, error } = await admin.rpc("reserve_coach_ai_request", {
      p_user_id: data.user.id,
    });
    if (error) {
      console.error("Paid Coaching quota unavailable:", error.code ?? "rpc_error");
      return false;
    }
    return reserved === true;
  } catch {
    // Misconfigured authentication or absent migrations must not generate costs.
    return false;
  }
}
