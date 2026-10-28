// DEPRECATED: The original local JSON-file Ranked result store allowed callers
// to invent outcomes and times. It must never be used for a leaderboard.
// Keep these exports temporarily so an unmerged teammate component fails
// closed instead of silently resurrecting the insecure result writer.
export type RankedResultInput = {
  gameId: string;
  playerName: string;
  boardSize: number;
  mineCount: number;
  durationMs: number;
  outcome: "win";
};
export type RankedResult = RankedResultInput & { id: string; submittedAt: string };

const blocked = "Legacy Ranked result submissions are disabled. Use server-verified matches.";

export function parseRankedResultInput(
  _value: unknown,
): { ok: true; value: RankedResultInput } | { ok: false; error: string } {
  void _value;
  return { ok: false, error: blocked };
}

export async function listRankedResults(
  _boardSize: number,
  _mineCount: number,
): Promise<RankedResult[]> {
  void _boardSize;
  void _mineCount;
  throw new Error(blocked);
}

export async function saveRankedResult(
  _input: RankedResultInput,
): Promise<never> {
  void _input;
  throw new Error(blocked);
}
