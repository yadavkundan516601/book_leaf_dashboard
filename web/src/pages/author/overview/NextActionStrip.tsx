import type { ReactNode } from "react";
import { Link } from "react-router";
import { AlarmIcon, ChatIcon, CheckCircleIcon, HelpIcon } from "../../../components/icons";
import { Skeleton } from "../../../components/ui";
import type { NextAction } from "./nextAction";

const ICONS: Record<NextAction["kind"], ReactNode> = {
  replies: <ChatIcon size={22} />,
  rollover: <AlarmIcon size={22} />,
  "first-payout": <HelpIcon size={22} />,
  "all-clear": <CheckCircleIcon size={22} />,
};

/** One-line "what should I do next?" strip under the welcome banner. */
export function NextActionStrip({ action }: { action: NextAction | null }) {
  if (!action) {
    return (
      <section className="ah-next" aria-label="Next step" aria-busy="true">
        <Skeleton width={36} height={36} radius={0} />
        <div className="ah-next__text">
          <Skeleton width="40%" height={14} radius={0} />
          <Skeleton width="70%" height={12} radius={0} />
        </div>
      </section>
    );
  }
  return (
    <section className={`ah-next ah-next--${action.tone}`} aria-label="Next step">
      <span className="ah-next__icon" aria-hidden="true">
        {ICONS[action.kind]}
      </span>
      <div className="ah-next__text">
        <h2 className="ah-next__title">{action.title}</h2>
        <p className="ah-next__body">{action.body}</p>
      </div>
      {action.link && (
        <Link className="btn btn--sm ah-next__link" to={action.link.to}>
          {action.link.label}
        </Link>
      )}
    </section>
  );
}
