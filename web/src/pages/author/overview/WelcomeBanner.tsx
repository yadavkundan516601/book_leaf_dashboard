import { Link } from "react-router";

const today = () =>
  new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Coral greeting banner with today's date, a status line and the two main actions. */
export function WelcomeBanner({ firstName, summary }: { firstName: string; summary: string }) {
  return (
    <section className="ah-banner" aria-labelledby="ah-banner-title">
      <div className="ah-banner__text">
        <p className="ah-banner__date">{today()}</p>
        <h1 id="ah-banner-title" className="ah-banner__title">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="ah-banner__summary">{summary}</p>
      </div>
      <div className="ah-banner__actions">
        <Link className="btn ah-banner__btn ah-banner__btn--solid" to="/author/tickets/new">
          Ask a question
        </Link>
        <Link className="btn ah-banner__btn ah-banner__btn--outline" to="/author/books">
          View my books
        </Link>
      </div>
    </section>
  );
}
