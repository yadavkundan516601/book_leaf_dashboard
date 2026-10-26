import { Link } from "react-router";
import { EmptyState } from "../EmptyState";

/** Placeholder for nav destinations that are built in a later phase, so no sidebar link 404s. */
export function ComingSoon({ title, backTo, backLabel }: { title: string; backTo: string; backLabel: string }) {
  return (
    <div className="stack-lg">
      <div className="page-header">
        <h1>{title}</h1>
      </div>
      <div className="card">
        <EmptyState
          title="This page is being built"
          action={
            <Link className="btn btn--primary" to={backTo}>
              {backLabel}
            </Link>
          }
        >
          It will be ready soon. In the meantime, everything you need is still available from the menu.
        </EmptyState>
      </div>
    </div>
  );
}
