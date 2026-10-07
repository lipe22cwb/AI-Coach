import { Gamepad2, Trophy } from "lucide-react";

export function ModeSelector() {
  return (
    // Practice stays selected while this screen is a mockup. When modes become
    // interactive, keep the selected mode in the parent and pass it in as a prop.
    <div className="mode-selector" role="group" aria-label="Game mode preview">
      <button type="button" className="mode-button selected" aria-pressed="true">
        <Gamepad2 size={18} aria-hidden="true" />
        Practice Mode
      </button>

      <button
        type="button"
        className="mode-button ranked"
        aria-pressed="false"
        aria-disabled="true"
        title="Ranked — preview only"
      >
        <Trophy size={17} aria-hidden="true" />
        Play Ranked
      </button>
    </div>
  );
}
