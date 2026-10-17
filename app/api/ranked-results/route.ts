import {
  listRankedResults,
  parseRankedResultInput,
  saveRankedResult,
} from "@/lib/ranked-results";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

function parsePositiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const boardSize = parsePositiveInteger(searchParams.get("boardSize"));
  const mineCount = parsePositiveInteger(searchParams.get("mineCount"));

  if (boardSize === null || boardSize < 2 || boardSize > 50 || mineCount === null) {
    return Response.json(
      { error: "Provide a boardSize from 2 to 50 and a positive mineCount." },
      { status: 400, headers: noStore },
    );
  }
  if (mineCount >= boardSize ** 2) {
    return Response.json(
      { error: "mineCount must be smaller than the board." },
      { status: 400, headers: noStore },
    );
  }

  try {
    const results = await listRankedResults(boardSize, mineCount);
    return Response.json(
      {
        mode: "ranked",
        boardSize,
        mineCount,
        results: results.map((result, index) => ({ rank: index + 1, ...result })),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("Could not read Ranked results.", error);
    return Response.json(
      { error: "Ranked results are temporarily unavailable." },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseRankedResultInput(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const saved = await saveRankedResult(parsed.value);
    return Response.json(saved, {
      status: saved.duplicate ? 200 : 201,
      headers: noStore,
    });
  } catch (error) {
    console.error("Could not save Ranked result.", error);
    return Response.json(
      { error: "Ranked result could not be saved." },
      { status: 500, headers: noStore },
    );
  }
}
