import type { ReactNode } from "react";
import { errorMessage } from "../../../api/client";
import { Card } from "../../../components/ui";

/** Error card with a Retry button (and optional extra actions). */
export function LoadError({
  title = "We couldn't load this",
  error,
  onRetry,
  retrying = false,
  children,
}: {
  title?: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className="at-state at-state--error" role="alert">
      <h2 className="at-state__title">{title}</h2>
      <p className="at-state__text">{errorMessage(error)}</p>
      <div className="at-state__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : "Retry"}
        </button>
        {children}
      </div>
    </Card>
  );
}

/** Explained empty state with a next step. */
export function EmptyCard({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <Card className="at-state">
      <h2 className="at-state__title">{title}</h2>
      <p className="at-state__text">{children}</p>
      <div className="at-state__actions">{actions}</div>
    </Card>
  );
}
