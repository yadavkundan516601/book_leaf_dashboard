import type { TicketStatus } from "@bookleaf/shared";
import { Link } from "react-router";
import { CheckIcon } from "../../../components/icons";
import { Card, CardHeader } from "../../../components/ui";
import { NEXT_STEPS, STATUS_MEANING } from "./status";

const FLOW: { status: TicketStatus; label: string }[] = [
  { status: "open", label: "Received" },
  { status: "in_progress", label: "In progress" },
  { status: "resolved", label: "Resolved" },
];
const CLOSED = { status: "closed" as const, label: "Closed" };
const ORDER: Record<TicketStatus, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };

/** Received → In progress → Resolved, with Closed appended as the final state when it applies. */
export function StatusStepper({ status }: { status: TicketStatus }) {
  const steps = status === "closed" ? [...FLOW, CLOSED] : FLOW;
  const current = ORDER[status];
  return (
    <ol className="tc-stepper" aria-label="Progress of your query">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li
            key={s.status}
            className={`tc-step tc-step--${state}${s.status === "closed" ? " tc-step--final" : ""}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="tc-step__marker" aria-hidden="true">
              {state === "done" ? <CheckIcon /> : i + 1}
            </span>
            <span className="tc-step__label">
              {s.label}
              <span className="ui-sr-only">
                {state === "done" ? " (done)" : state === "current" ? " (current stage)" : " (not reached yet)"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "Where things stand" card: the stepper, what the status means and what happens next. */
export function StatusCard({
  status,
  newQueryHref,
  showNextSteps = true,
}: {
  status: TicketStatus;
  newQueryHref: string;
  /** Hidden while the "query received" banner already lists the next steps. */
  showNextSteps?: boolean;
}) {
  const next = NEXT_STEPS[status];
  return (
    <Card as="section" className="tc-status" aria-labelledby="tc-status-title">
      <CardHeader title="Where things stand" titleId="tc-status-title" subtitle={STATUS_MEANING[status].long} />
      <StatusStepper status={status} />
      {showNextSteps && (
        <div className="tc-next">
          <h3 className="tc-next__title">What happens next</h3>
          <p className="tc-next__lead">{next.title}</p>
          <ul className="tc-next__list">
            {next.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {status === "closed" && (
            <Link to={newQueryHref} className="btn btn--primary btn--sm">
              Start a new query
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
