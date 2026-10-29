import { guardPublicCoachPost } from "@/lib/coach/public-rate-guard";
import { checkPublicCoachRateLimit } from "@/lib/coach/public-rate-limit";
import { validateFocusSelection } from "@/lib/coach/evidence-report";
import { handleVerifiedCoachPost } from "@/lib/coach/http-handlers";
import { reservePaidCoachCall } from "@/lib/coach/paid-access";
import { prepareVerifiedFocusInput } from "@/lib/coach/verified-focus-input";
import { getConfiguredProvider, requestNarrative } from "@/lib/coach/providers";

// Deterministic evidence remains free. Only AI prioritization consumes a quota.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  return guardPublicCoachPost(request, checkPublicCoachRateLimit, () =>
    handleVerifiedCoachPost(request, {
      prepareVerifiedFocusInput,
      reservePaidCoachCall,
      getConfiguredProvider,
      requestNarrative,
      validateFocusSelection,
    }),
  );
}
