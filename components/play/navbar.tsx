import { Gamepad2, Settings2, UserRound, MessageSquare, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { MineLogo } from "./mine-logo";

type NavPage = "play" | "settings";

const navigationItems: Array<{
  label: string;
  icon: LucideIcon;
  href?: string;
  page?: NavPage;
}> = [
  { label: "Play", icon: Gamepad2, href: "/", page: "play" },
  { label: "Profile", icon: UserRound },
  { label: "Coaching", icon: MessageSquare },
  { label: "Settings", icon: Settings2, href: "/settings", page: "settings" },
] as const;

type NavbarProps = {
  activePage?: NavPage;
};

export function Navbar({ activePage = "play" }: NavbarProps) {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <a className="brand" href="/" aria-label="AI-Coach home">
          <MineLogo className="brand-mine" />
          <span>AI-Coach</span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          {navigationItems.map(({ label, icon: Icon, href, page }) => {
            const active = page === activePage;
            const content = (
              <>
                <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{label}</span>
              </>
            );

            return href ? (
              <Link
                key={label}
                href={href}
                className={`nav-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                title={label}
              >
                {content}
              </Link>
            ) : (
              <button
                key={label}
                type="button"
                className="nav-item"
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
