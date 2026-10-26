import { Link } from "react-router";
import { Card, CardHeader } from "../../../components/ui";
import { PRODUCTION_STAGES } from "../../../lib/productionStage";

/** Short policy notes for the stages that have one. */
const STAGE_NOTES: Partial<Record<(typeof PRODUCTION_STAGES)[number], string>> = {
  Editing: "Only if you opted for editing",
  "Cover Design": "Needs your approval; a common cause of delays",
  Proofreading: "Revisions here can add time",
  "ISBN Assignment": "A unique ISBN under BookLeaf's imprint",
  Printing: "5–7 business days as standard",
  "Distribution Setup": "Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store",
  "Published & Live": "Listings go live 7–10 business days after publication",
};

/** The nine production stages as a horizontal stepper; scrolls sideways inside its own box on narrow screens. */
export function ProductionStepper() {
  return (
    <Card as="section" aria-labelledby="hb-stages-title">
      <CardHeader
        titleId="hb-stages-title"
        title="How your book is produced"
        subtitle="Every book moves through these stages in order."
        actions={
          <Link className="hb-link" to="/author/books">
            Track your books <span aria-hidden="true">→</span>
          </Link>
        }
      />
      {/* Focusable so keyboard users can scroll it when it overflows. */}
      <div className="hb-stepper" role="region" aria-label="Production stages, scrollable" tabIndex={0}>
        <ol className="hb-stepper__list" aria-label={`Production stages, ${PRODUCTION_STAGES.length} steps in order`}>
          {PRODUCTION_STAGES.map((stage, i) => (
            <li className="hb-stepper__step" key={stage}>
              <span className="hb-stepper__marker" aria-hidden="true">
                {i + 1}
              </span>
              <span className="hb-stepper__name">
                <span className="ui-sr-only">Step {i + 1}: </span>
                {stage}
              </span>
              {STAGE_NOTES[stage] && <span className="hb-stepper__note">{STAGE_NOTES[stage]}</span>}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
