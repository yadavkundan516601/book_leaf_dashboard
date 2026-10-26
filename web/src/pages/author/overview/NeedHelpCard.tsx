import { Link } from "react-router";
import { Card, CardHeader } from "../../../components/ui";

/** Points the author at self-service answers first, then at the team. */
export function NeedHelpCard() {
  return (
    <Card as="section" className="ah-area-help ah-help-card" aria-labelledby="ah-help-title">
      <CardHeader titleId="ah-help-title" title="Need help?" />
      <p className="ah-help-card__text">
        Most questions about royalties, ISBNs, printing and listings are answered in our Help &amp; FAQ. If yours isn't, ask
        our team and we'll reply in your query.
      </p>
      <div className="ah-help-card__actions">
        <Link className="btn btn--sm" to="/author/help">
          Browse Help &amp; FAQ
        </Link>
        <Link className="btn btn--primary btn--sm" to="/author/tickets/new">
          Ask our team
        </Link>
      </div>
    </Card>
  );
}
