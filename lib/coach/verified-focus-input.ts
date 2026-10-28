import { buildEvidenceReport, type EvidenceReport } from "./evidence-report.ts";
import { parseVerifiedPracticeRecording } from "./verified-brief.ts";

/**
 * The AI-focus endpoint must validate the same checkpoint-stamped recording
 * as the provider-neutral verified-brief endpoint.
 *
 * A 400 is a malformed recording; a 422 is a well-shaped recording whose
 * board replay, checkpoints, or declared outcome do not agree.
 *
 * This checks replay consistency, NOT authenticity of a client-recorded game.
 */
export type VerifiedFocusInput =
  | { ok: true; report: EvidenceReport }
  | { ok: false; status: 400 | 422; error: string };

export function prepareVerifiedFocusInput(raw: unknown): VerifiedFocusInput {
  let game;
  try {
    game = parseVerifiedPracticeRecording(raw);
  } catch {
    return {
      ok: false,
      status: 400,
      error:
        "The Practice recording is missing or invalid, or a move checkpoint is absent.",
    };
  }

  try {
    return { ok: true, report: buildEvidenceReport(game) };
  } catch {
    return {
      ok: false,
      status: 422,
      error:
        "The Practice recording did not match its visible-board checkpoints or final outcome.",
    };
  }
}
