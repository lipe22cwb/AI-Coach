import Link from "next/link";
import { Gamepad2, Trophy } from "lucide-react";

export function ModeSelector() {
  return (
    <div className="mode-selector" role="group" aria-label="Game mode">
      {/* Practice Mode remains selected on the homepage. */}
      <button type="button" className="mode-button selected" aria-pressed="true">
        <Gamepad2 size={18} aria-hidden="true" />
        Practice Mode
      </button>

      {/* Open the separate Ranked page. */}
      <Link href="/ranked" className="mode-button ranked" title="View your Ranked match">
        <Trophy size={17} aria-hidden="true" />
        Play Ranked
      </Link>
    </div>
  );
}
