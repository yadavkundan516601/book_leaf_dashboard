import { useEffect } from "react";
import { Link } from "react-router";
import { Card, CardHeader, PageHeader } from "../../components/ui";
import "../../styles/author-help-books.css";
import { FaqBrowser } from "./help/FaqBrowser";
import { ProductionStepper } from "./help/ProductionStepper";

/** Self-service answers: searchable FAQ, the production pipeline and a way to reach the team. */
export function HelpPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Help & FAQ | BookLeaf Author Support";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="hb-page">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", to: "/author/overview" }, { label: "Help & FAQ" }]}
        title="Help & FAQ"
        subtitle="Quick answers about royalties, ISBNs, printing, listings and production."
        actions={
          <Link className="btn btn--primary" to="/author/tickets/new">
            Ask our team
          </Link>
        }
      />
      <FaqBrowser />
      <ProductionStepper />
      <Card as="section" className="hb-stuck" aria-labelledby="hb-stuck-title">
        <div className="hb-stuck__text">
          <CardHeader titleId="hb-stuck-title" title="Still stuck?" />
          <p className="hb-muted">
            Ask our team and include your book's title so we can look into it. If your issue needs escalating, we'll give
            you a clear timeline, such as 48 hours.
          </p>
        </div>
        <div className="hb-stuck__actions">
          <Link className="btn" to="/author/tickets">
            View my queries
          </Link>
          <Link className="btn btn--primary" to="/author/tickets/new">
            Ask our team
          </Link>
        </div>
      </Card>
    </div>
  );
}
