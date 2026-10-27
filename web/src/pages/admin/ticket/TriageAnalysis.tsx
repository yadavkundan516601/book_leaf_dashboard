import { TRIAGE_LANGUAGE_LABELS, TRIAGE_SENTIMENT_LABELS, type ClassificationDto } from "@bookleaf/shared";
import { HelpTip, Pill } from "../../../components/ui";
import { SENTIMENT_HELP, SENTIMENT_TONE } from "./format";

/** Compact "AI analysis" block for the classification card: escalation, summary, tone and a suggested first step. */
export function TriageAnalysis({ classification: c }: { classification: ClassificationDto }) {
  if (!c.summary && !c.sentiment && !c.nextAction && !c.escalate) return null;
  return (
    <section className="aw-triage" aria-labelledby="aw-triage-title">
      <h3 id="aw-triage-title" className="aw-triage__title">
        AI analysis
      </h3>
      {c.escalate && (
        <div className="aw-triage__escalate" role="note">
          <strong>Escalate</strong>
          <span>{c.escalateReason ?? "Flagged for escalation by the classifier."}</span>
        </div>
      )}
      {c.summary && <p className="aw-triage__summary">{c.summary}</p>}
      {(c.sentiment || (c.language && c.language !== "en")) && (
        <div className="aw-triage__tags">
          {c.sentiment && (
            <span className="aw-inline">
              <Pill tone={SENTIMENT_TONE[c.sentiment]}>
                <span className="ui-sr-only">Author tone: </span>
                {TRIAGE_SENTIMENT_LABELS[c.sentiment]}
              </Pill>
              <HelpTip label="What does the author tone mean?">{SENTIMENT_HELP}</HelpTip>
            </span>
          )}
          {c.language && c.language !== "en" && (
            <Pill tone="neutral">
              <span className="ui-sr-only">Language: </span>
              {TRIAGE_LANGUAGE_LABELS[c.language]}
            </Pill>
          )}
        </div>
      )}
      {c.nextAction && (
        <div className="aw-triage__next">
          <p className="aw-triage__label">Suggested next action</p>
          <p>{c.nextAction}</p>
          <p className="field__hint">A suggestion from the classifier. Check the facts before acting on it.</p>
        </div>
      )}
    </section>
  );
}
