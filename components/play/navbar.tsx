import { Gamepad2, Settings2, UserRound, MessageSquare } from "lucide-react";

import { MineLogo } from "./mine-logo";

// Add navigation entries here. They are preview buttons until those pages exist;
// when a page is ready, give its entry a route and render a Next.js Link instead.
const navigationItems = [
  { label: "Play", icon: Gamepad2, active: true },
  { label: "Profile", icon: UserRound, active: false },
  { label: "Coaching", icon: MessageSquare, active: false },
  { label: "Settings", icon: Settings2, active: false },
];

export function Navbar() {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="/" aria-label="AI-Coach home">
          <MineLogo className="brand-mine" />
          <span>AI-Coach</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {/* Icon is capitalised so React treats it as a component in the loop. */}
          {navigationItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              aria-disabled={!active}
              title={active ? "Play" : `${label} — preview only`}
            >
              <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
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
