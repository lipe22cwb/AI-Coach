// Ranked leaderboard data is derived exclusively from the database's
// server-verified match-completion trigger. Never accept results from clients.
export const RANKED_ROWS = 16;
export const RANKED_COLUMNS = 16;
export const RANKED_MINES = 40;
export const RANKED_LEADERBOARD_LIMIT = 50;

type PublicEntry = {
  rank: number;
  durationMs: number;
  finishedAt: string;
};

/** Preserve the prototype query format, but allow only the current Ranked mode. */
export function parseRankedBoardQuery(
  params: URLSearchParams,
): { ok: true } | { ok: false; error: string } {
  const boardSize = params.getAll("boardSize");
  const mineCount = params.getAll("mineCount");
  if (
    boardSize.length !== 1 ||
    mineCount.length !== 1 ||
    boardSize[0] !== String(RANKED_ROWS) ||
    mineCount[0] !== String(RANKED_MINES) ||
    [...params.keys()].some((key) => key !== "boardSize" && key !== "mineCount")
  ) {
    return {
      ok: false,
      error: "Only boardSize=16&mineCount=40 is supported for verified Ranked results.",
    };
  }
  return { ok: true };
}

/** Fail closed if the trusted database returns unexpected data. */
export function serializeVerifiedResults(rows: unknown): PublicEntry[] {
  if (!Array.isArray(rows) || rows.length > RANKED_LEADERBOARD_LIMIT) {
    throw new Error("Invalid verified leaderboard data.");
  }
  let previousDuration = 0;
  let previousFinish = "";
  return rows.map((row: unknown, index: number): PublicEntry => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error("Invalid verified result row.");
    }
    const value = row as Record<string, unknown>;
    const duration = value.duration_ms;
    const finished = value.finished_at;
    if (
      typeof duration !== "number" ||
      !Number.isSafeInteger(duration) ||
      duration < 1 ||
      typeof finished !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(finished) ||
      !Number.isFinite(Date.parse(finished))
    ) {
      throw new Error("Invalid verified result duration or finish time.");
    }
    if (
      duration < previousDuration ||
      (duration === previousDuration && finished < previousFinish)
    ) {
      throw new Error("Verified results were not sorted by the database.");
    }
    previousDuration = duration;
    previousFinish = finished;
    // Do not expose user IDs, authentication data, or internal match IDs.
    return { rank: index + 1, durationMs: duration, finishedAt: finished };
  });
}
