"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { Gamepad2, MessageSquare, Settings2, UserRound } from "lucide-react";

import { MineLogo } from "./mine-logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const navigationItems = [
  { label: "Play", icon: Gamepad2, route: "/" },
  { label: "Profile", icon: UserRound, route: "/profile" },
  { label: "Coaching", icon: MessageSquare, route: "/coaching" },
  { label: "Settings", icon: Settings2, route: "/settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingUser(false);
      return;
    }

    // Capture auth after the null check so TypeScript can safely use it
    // inside loadUser, even though that async function runs later.
    const auth = supabase.auth;

    async function loadUser() {
      try {
        const {
          data: { user },
        } = await auth.getUser();
        setUser(user);
      } catch {
        setUser(null);
      } finally {
        setLoadingUser(false);
      }
    }

    void loadUser();

    // Keep the navbar updated when a user signs in or out.
    const {
      data: { subscription },
    } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoadingUser(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSignOutError("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSignOutError("Sign-out is unavailable because Supabase is not configured.");
      return;
    }

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError("Could not sign out. Please try again.");
        return;
      }
      setUser(null);
      router.push("/");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Please try again.");
    }
  }

  const username =
    user?.user_metadata?.username || user?.email?.split("@")[0] || "Profile";

  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="AI-Coach home">
          <MineLogo className="brand-mine" />
          <span>AI-Coach</span>
        </Link>

        <nav className="main-nav" aria-label="Main navigation">
          {navigationItems.map(({ label, icon: Icon, route }) => {
            const active = route ? pathname === route : false;

            if (route) {
              return (
                <Link
                  key={label}
                  href={route}
                  className={`nav-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            }

            return (
              <button
                key={label}
                type="button"
                className="nav-item nav-item-preview"
                aria-disabled="true"
                title={`${label} page coming later`}
              >
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav-account">
          {!loadingUser && user ? (
            <>
              <Link href="/profile" className="sign-in">
                {username}
              </Link>

              <button type="button" className="sign-out-button" onClick={handleSignOut}>
                Sign Out
              </button>
              {signOutError && <span role="alert">{signOutError}</span>}
            </>
          ) : !loadingUser ? (
            <Link
              href="/sign-in"
              className={`sign-in${pathname === "/sign-in" ? " active" : ""}`}
            >
              Sign In
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
