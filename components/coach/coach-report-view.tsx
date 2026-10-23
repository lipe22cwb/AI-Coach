import { AlertTriangle, Check, Sparkles, Target } from "lucide-react";

import type { CoachReport } from "@/lib/coach/types";

// Renders a coaching report. Pure presentation: the report could come from the
// rule engine or an AI provider, and this component does not care which.

const SOURCE_LABEL: Record<CoachReport["source"], string> = {
  rules: "Built-in rule coach",
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
};

function metricItems(report: CoachReport) {
  const metrics = report.metrics;
  if (!metrics) return [];
  const items: Array<{ label: string; value: string }> = [
    {
      label: "Certain reveals",
      value: `${metrics.logicalReveals} / ${metrics.reveals}`,
    },
    {
      label: "Guesses",
      value: `${metrics.guesses}${metrics.avoidableGuesses > 0 ? ` (${metrics.avoidableGuesses} avoidable)` : ""}`,
    },
    {
      label: "Flag accuracy",
      value: `${Math.round(metrics.flagAccuracy * 100)}%`,
    },
    { label: "Chords", value: String(metrics.chords) },
    {
      label: "Opening click",
      value: metrics.openingCell === "unknown" ? "—" : metrics.openingCell,
    },
  ];
  return items;
}

export function CoachReportView({
  report,
  fallbackReason,
}: {
  report: CoachReport;
  fallbackReason: string | null;
}) {
  const items = metricItems(report);

  return (
    <article className="coach-report">
      <div className="report-heading">
        <span className="report-marker" aria-hidden="true" />
        <h2>POST-GAME FEEDBACK</h2>
      </div>

      <div className="coach-report-top">
        <div className="grade-badge">
          <span className="grade-letter">{report.grade}</span>
          <span className="grade-score">{report.score}/100</span>
        </div>
        <div>
          <h3>{report.headline}</h3>
          <span className="coach-source">
            <Sparkles size={13} aria-hidden="true" />
            {SOURCE_LABEL[report.source]}
            {report.model ? ` · ${report.model}` : ""}
          </span>
        </div>
      </div>

      <p className="coach-intro">{report.summary}</p>

      {fallbackReason ? (
        <p className="coach-fallback">
          <AlertTriangle size={14} aria-hidden="true" />
          {fallbackReason}
        </p>
      ) : null}

      {items.length > 0 ? (
        <dl className="coach-metrics">
          {items.map((item) => (
            <div key={item.label} className="coach-metric">
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {report.keyMoment ? (
        <div className="coach-keymoment">
          <span className="subtle-label">
            Key moment · move {report.keyMoment.moveNumber}
          </span>
          <p>{report.keyMoment.description}</p>
          <span className="coach-coords">
            Row {report.keyMoment.row + 1}, column {report.keyMoment.col + 1}
          </span>
        </div>
      ) : null}

      <div className="coach-columns">
        <section className="coach-list">
          <h4 className="coach-list-good">
            <Check size={15} aria-hidden="true" />
            What worked
          </h4>
          <ul>
            {report.strengths.map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        </section>

        <section className="coach-list">
          <h4 className="coach-list-improve">
            <Target size={15} aria-hidden="true" />
            What to work on
          </h4>
          <ul>
            {report.improvements.map((improvement, index) => (
              <li key={index}>{improvement}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="next-step">
        <span className="subtle-label">Next game</span>
        <ul className="coach-next">
          {report.nextSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
