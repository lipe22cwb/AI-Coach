import { buildEvidenceReport, validateFocusSelection } from "@/lib/coach/evidence-report";
import { getConfiguredProvider, requestNarrative } from "@/lib/coach/providers";
import type { PracticeSession } from "@/lib/practice/history";

// AI may choose a focus and presentation style. It is never allowed to author
// findings, classifications, mine positions, or official game statistics.
// The browser renders only the deterministic report's fixed evidence text.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validGame(value: unknown): value is PracticeSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const game = value as Partial<PracticeSession>;
  const integer = (num: unknown): num is number =>
    typeof num === "number" && Number.isSafeInteger(num) && num >= 0;
  if (
    game.game !== "minesweeper" ||
    !integer(game.rows) ||
    !integer(game.columns) ||
    game.rows < 2 ||
    game.columns < 2 ||
    game.rows * game.columns > 600 ||
    !integer(game.mineCount) ||
    game.mineCount >= game.rows * game.columns ||
    (game.outcome !== "win" && game.outcome !== "loss") ||
    !integer(game.durationSeconds) ||
    typeof game.difficulty !== "string" ||
    game.difficulty.length > 40 ||
    !Array.isArray(game.mines) ||
    game.mines.length !== game.mineCount ||
    !game.mines.every((index) => integer(index) && index < game.rows! * game.columns!) ||
    new Set(game.mines).size !== game.mineCount ||
    !Array.isArray(game.moves) ||
    game.moves.length === 0 ||
    game.moves.length > 1500
  )
    return false;
  return game.moves.every(
    (move) =>
      move &&
      integer(move.row) &&
      move.row < game.rows! &&
      integer(move.col) &&
      move.col < game.columns! &&
      ["reveal", "flag", "unflag", "chord"].includes(move.action) &&
      (move.atMs === undefined || integer(move.atMs)),
  );
}

export async function POST(request: Request): Promise<Response> {
  let data: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 200_000)
      return Response.json({ error: "Recording is too large." }, { status: 413 });
    data = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Send valid JSON for a finished Practice game." },
      { status: 400 },
    );
  }
  if (!validGame(data)) {
    return Response.json(
      { error: "The Practice recording is missing or invalid." },
      { status: 400 },
    );
  }

  let report;
  try {
    report = buildEvidenceReport(data);
  } catch {
    return Response.json(
      { error: "The recording could not be verified against its outcome." },
      { status: 422 },
    );
  }

  const fallback = {
    focusId: report.moments[0]?.id ?? null,
    style: "step-by-step",
    selectedBy: "rules",
    model: null,
    note: "The verified analysis chose the focus; no AI provider was needed.",
  };
  const provider = getConfiguredProvider();
  if (!provider || report.moments.length === 0) {
    return Response.json({
      ...fallback,
      note:
        report.moments.length === 0
          ? "No verified moments were available to prioritize."
          : "No AI provider is configured, so the verified rule coach chose a focus.",
    });
  }

  const choices = report.moments.map((moment) => ({
    id: moment.id,
    kind: moment.kind,
    category: moment.category,
    occurrences: moment.occurrences,
    what: moment.finding,
    proof: moment.evidence,
    advice: moment.nextTime,
  }));

  try {
    // requestNarrative is the existing three-provider JSON adapter. We use its
    // headline and summary as two constrained choice fields, not free prose.
    const selection = await requestNarrative(
      provider,
      [
        "You select ONE teaching priority from already verified Minesweeper findings.",
        "Use only the allowed moment IDs. Prefer repeatable mistakes over praise; do not manufacture findings.",
        "Return a JSON object with exactly these keys:",
        '{"headline":"move-N", "summary":"direct", "strengths":[], "improvements":[], "nextSteps":[]}',
        "headline must equal exactly one supplied id. summary must be exactly 'direct' or 'step-by-step'.",
        "Do not write any explanations or extra words. You cannot change the evidence.",
      ].join("\n"),
      JSON.stringify({ available: choices, allowedStyles: ["direct", "step-by-step"] }),
    );
    const checked = validateFocusSelection(
      report,
      selection?.headline,
      selection?.summary,
    );
    if (!checked) {
      return Response.json({
        ...fallback,
        note: "AI selection was outside the allowed evidence; the verified fallback was used.",
      });
    }
    return Response.json({
      focusId: checked.focusId,
      style: checked.style,
      selectedBy: provider.id,
      model: provider.model,
      note: "AI prioritized a verified moment. All displayed facts and advice remain rule-generated.",
    });
  } catch {
    return Response.json({
      ...fallback,
      note: "AI selection was unavailable; verified rule-based focus was used.",
    });
  }
}
