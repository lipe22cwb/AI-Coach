import { ChevronDown, Crosshair } from "lucide-react";

// A general strategy tip shown before play, never a personalized recommendation.
export function CurrentFocus() {
  return (
    <details className="focus-panel">
      <summary className="focus-toggle" title="General Practice tip">
        <Crosshair size={19} aria-hidden="true" />
        <span>Practice tip</span>
        <ChevronDown className="focus-chevron" size={17} aria-hidden="true" />
        <span className="focus-tooltip" aria-hidden="true">
          General tip
        </span>
      </summary>
      <div className="focus-content">
        <span className="subtle-label">General strategy — not personalized feedback</span>
        <h2>Check before you guess.</h2>
        <p>
          Look for guaranteed-safe squares from the revealed numbers before choosing an
          uncertain move.
        </p>
        <div className="focus-example">
          <strong>Check the evidence behind flags.</strong>
          <p>
            A flag is a player's guess or deduction, not proof by itself. Confirm what the
            visible numbers establish before treating neighboring squares as safe.
          </p>
        </div>
      </div>
    </details>
  );
}
