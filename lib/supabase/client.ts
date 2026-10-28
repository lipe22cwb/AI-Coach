import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
  );
}

/** Return null rather than crashing when public Supabase settings are missing. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;

  try {
    browserClient = createBrowserClient(url, key);
    return browserClient;
  } catch {
    // Malformed setup should not crash the page or the sign-in form.
    console.error("Supabase browser configuration is invalid.");
    return null;
  }
}

/** Legacy helper: callers must handle null when Supabase is unavailable. */
export function createClient(): SupabaseClient | null {
  return getSupabaseBrowserClient();
}
