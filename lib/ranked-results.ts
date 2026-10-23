import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RankedResultInput = {
  gameId: string;
  playerName: string;
  boardSize: number;
  mineCount: number;
  durationMs: number;
  outcome: "win";
};

export type RankedResult = RankedResultInput & {
  id: string;
  submittedAt: string;
};

const RESULTS_PATH = join(process.cwd(), "data", "ranked-results.json");
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
let writeQueue: Promise<void> = Promise.resolve();

export function parseRankedResultInput(
  value: unknown,
): { ok: true; value: RankedResultInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const input = value as Record<string, unknown>;
  const gameId = typeof input.gameId === "string" ? input.gameId.trim() : "";
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(gameId)) {
    return {
      ok: false,
      error: "gameId must contain 8 to 64 letters, numbers or hyphens.",
    };
  }

  const playerName = typeof input.playerName === "string" ? input.playerName.trim() : "";
  if (
    playerName.length < 2 ||
    playerName.length > 24 ||
    /[\u0000-\u001f\u007f]/.test(playerName)
  ) {
    return { ok: false, error: "playerName must be 2 to 24 visible characters." };
  }

  const { boardSize, mineCount, durationMs } = input;
  if (!Number.isInteger(boardSize) || Number(boardSize) < 2 || Number(boardSize) > 50) {
    return { ok: false, error: "boardSize must be an integer from 2 to 50." };
  }
  if (
    !Number.isInteger(mineCount) ||
    Number(mineCount) < 1 ||
    Number(mineCount) >= Number(boardSize) ** 2
  ) {
    return {
      ok: false,
      error: "mineCount must be a positive integer smaller than the board.",
    };
  }
  if (
    !Number.isInteger(durationMs) ||
    Number(durationMs) < 1 ||
    Number(durationMs) > MAX_DURATION_MS
  ) {
    return { ok: false, error: "durationMs must be from 1 to 86400000." };
  }
  if (input.outcome !== "win") {
    return { ok: false, error: "Only winning Ranked games can be submitted." };
  }

  return {
    ok: true,
    value: {
      gameId,
      playerName,
      boardSize: Number(boardSize),
      mineCount: Number(mineCount),
      durationMs: Number(durationMs),
      outcome: "win",
    },
  };
}

async function readResults(): Promise<RankedResult[]> {
  try {
    const contents = await readFile(RESULTS_PATH, "utf8");
    const results: unknown = JSON.parse(contents);
    if (!Array.isArray(results)) {
      throw new Error("Ranked result file must contain a JSON array.");
    }
    return results as RankedResult[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeResults(results: RankedResult[]) {
  await mkdir(dirname(RESULTS_PATH), { recursive: true });
  const temporaryPath = `${RESULTS_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await rename(temporaryPath, RESULTS_PATH);
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function getBoardRank(results: RankedResult[], result: RankedResult) {
  const boardResults = results
    .filter(
      (candidate) =>
        candidate.boardSize === result.boardSize &&
        candidate.mineCount === result.mineCount,
    )
    .sort((first, second) => {
      const timeDifference = first.durationMs - second.durationMs;
      return timeDifference || first.submittedAt.localeCompare(second.submittedAt);
    });
  return boardResults.findIndex((candidate) => candidate.id === result.id) + 1;
}

export async function listRankedResults(boardSize: number, mineCount: number) {
  const results = await readResults();
  return results
    .filter((result) => result.boardSize === boardSize && result.mineCount === mineCount)
    .sort((first, second) => {
      const timeDifference = first.durationMs - second.durationMs;
      return timeDifference || first.submittedAt.localeCompare(second.submittedAt);
    });
}

export function saveRankedResult(input: RankedResultInput) {
  return serializeWrite(async () => {
    const results = await readResults();
    const existing = results.find((result) => result.gameId === input.gameId);
    if (existing) {
      return { result: existing, duplicate: true, rank: getBoardRank(results, existing) };
    }

    const result: RankedResult = {
      ...input,
      id: randomUUID(),
      submittedAt: new Date().toISOString(),
    };
    const updatedResults = [...results, result];
    await writeResults(updatedResults);
    return { result, duplicate: false, rank: getBoardRank(updatedResults, result) };
  });
}
