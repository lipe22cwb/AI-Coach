import { Gamepad2, MessageSquare, Settings2, UserRound } from "lucide-react";
import Link from "next/link";

import { MineLogo } from "./mine-logo";

// Add navigation entries here. An entry with `href` is a real page; the others
// stay preview buttons until those pages exist. `active` on <Navbar> decides
// which entry shows the underline.
const navigationItems = [
  { label: "Play", icon: Gamepad2, href: "/" },
  { label: "Profile", icon: UserRound, href: null },
  { label: "Coaching", icon: MessageSquare, href: "/coaching" },
  { label: "Settings", icon: Settings2, href: null },
];

export function Navbar({ active = "Play" }: { active?: string }) {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="AI-Coach home">
          <MineLogo className="brand-mine" />
          <span>AI-Coach</span>
        </Link>

        <nav className="main-nav" aria-label="Main navigation">
          {/* Icon is capitalised so React treats it as a component in the loop. */}
          {navigationItems.map(({ label, icon: Icon, href }) => {
            const isActive = label === active;
            const className = `nav-item${isActive ? " active" : ""}`;
            const content = (
              <>
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </>
            );

            if (href) {
              return (
                <Link
                  key={label}
                  href={href}
                  className={className}
                  aria-current={isActive ? "page" : undefined}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={label}
                type="button"
                className={className}
                aria-disabled="true"
                title={`${label} — preview only`}
              >
                {content}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          className="sign-in"
          aria-disabled="true"
          title="Sign in — preview only"
        >
          Sign In
        </button>
      </div>
    </header>
  );
}
