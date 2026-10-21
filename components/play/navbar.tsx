"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gamepad2,
  MessageSquare,
  Settings2,
  UserRound,
} from "lucide-react";

import { MineLogo } from "./mine-logo";

const navigationItems = [
  {
    label: "Play",
    icon: Gamepad2,
    route: "/",
  },
  {
    label: "Profile",
    icon: UserRound,
    route: "/profile",
  },
  {
    label: "Coaching",
    icon: MessageSquare,
    route: null,
  },
  {
    label: "Settings",
    icon: Settings2,
    route: null,
  },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="nav-shell">

        {/* Logo / Home */}
        <Link
          className="brand"
          href="/"
          aria-label="AI-Coach home"
        >
          <MineLogo className="brand-mine" />
          <span>AI-Coach</span>
        </Link>

        {/* Main navigation */}
        <nav className="main-nav" aria-label="Main navigation">
          {navigationItems.map(({ label, icon: Icon, route }) => {
            const active = route ? pathname === route : false;

            // Pages that currently exist
            if (route) {
              return (
                <Link
                  key={label}
                  href={route}
                  className={`nav-item${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />

                  <span>{label}</span>
                </Link>
              );
            }

            // Coaching and Settings are visual placeholders for now
            return (
              <button
                key={label}
                type="button"
                className="nav-item nav-item-preview"
                title={`${label} page coming later`}
              >
                <Icon
                  size={18}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />

                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sign In */}
        <Link
          href="/sign-in"
          className={`sign-in${
            pathname === "/sign-in" ? " active" : ""
          }`}
          aria-current={
            pathname === "/sign-in" ? "page" : undefined
          }
        >
          Sign In
        </Link>

      </div>
    </header>
  );
}