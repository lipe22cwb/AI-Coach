import { ChevronDown, Crosshair } from "lucide-react";

// <details> handles opening and closing on its own, including keyboard controls.
// Leave off `open` to start collapsed, or add it to show the target immediately.
export function CurrentFocus() {
  return (
    <details className="focus-panel">
      <summary className="focus-toggle" title="Current focus">
        <Crosshair size={19} aria-hidden="true" />
        <span>Current focus</span>
        <ChevronDown className="focus-chevron" size={17} aria-hidden="true" />
        <span className="focus-tooltip" aria-hidden="true">
          Current focus
        </span>
      </summary>

      <div className="focus-content">
        <span className="subtle-label">Practice target</span>
        <h2>Check before you guess.</h2>
        <p>
          Scan every revealed edge for a guaranteed safe square before choosing an
          uncertain one.
        </p>
        <div className="focus-example">
          <strong>Start with the 1s.</strong>
          <p>
            If a 1 already touches one flagged mine, its other covered neighbours are
            safe, provided that flag is correct.
          </p>
        </div>
      </div>
    </details>
  );
}
