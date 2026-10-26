import { useId, type ReactNode } from "react";
import { Card, CardHeader } from "../../../components/ui";

interface DashCardProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Grid placement class from admin-dashboard.css, e.g. "ad-span-8". */
  span: string;
  className?: string;
  children: ReactNode;
}

/** A dashboard section: Card with an h2 heading that also names the region. */
export function DashCard({ title, subtitle, actions, span, className, children }: DashCardProps) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className={["ad-card", span, className].filter(Boolean).join(" ")}>
      <CardHeader title={title} subtitle={subtitle} actions={actions} titleId={titleId} />
      {children}
    </Card>
  );
}

/** Error message with a Retry button; used inside every card whose query failed. */
export function CardError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="ad-error" role="alert">
      <p className="ad-error__text">We could not load {what}. Check your connection and try again.</p>
      <button type="button" className="btn btn--sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
