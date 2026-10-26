/**
 * Building blocks for list cards. Every list in the app (books, tickets, the
 * admin queue) uses the same anatomy so they read as one family:
 *
 *   head   : identity on the left, a small aside (status, time) on the right
 *   body   : title block | row of labelled stats | one prominent figure
 *   facts  : labelled chips (platforms, category, attachments ...)
 *   foot   : text links on the left, the primary action on the right
 */
import type { ReactNode } from "react";

export type CardAccent = "critical" | "high" | "new" | "success" | "warning";
export type FigureTone = "default" | "success" | "danger" | "primary" | "muted";

export function ListCard({ accent, children }: { accent?: CardAccent; children: ReactNode }) {
  return <article className={accent ? `lcard lcard--${accent}` : "lcard"}>{children}</article>;
}

export function CardHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="lcard__head">
      <div className="lcard__head-main">{children}</div>
      {aside && <div className="lcard__head-aside">{aside}</div>}
    </header>
  );
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="lcard__body">{children}</div>;
}

export function CardTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="lcard__title">
      <div className="lcard__name">{title}</div>
      {sub && <div className="lcard__sub">{sub}</div>}
    </div>
  );
}

export function CardStats({ children }: { children: ReactNode }) {
  return <dl className="lstats">{children}</dl>;
}

export function CardStat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: FigureTone }) {
  return (
    <div className="lstat">
      <dt>{label}</dt>
      <dd className={tone ? `tone-${tone}` : undefined}>{value}</dd>
      {sub && <div className="lstat__sub">{sub}</div>}
    </div>
  );
}

export function CardFigure({ value, caption, tone = "default" }: { value: ReactNode; caption?: ReactNode; tone?: FigureTone }) {
  return (
    <div className="lfigure">
      <div className={`lfigure__value tone-${tone}`}>{value}</div>
      {caption && <div className="lfigure__caption">{caption}</div>}
    </div>
  );
}

export function CardFacts({ children }: { children: ReactNode }) {
  return <div className="lcard__facts">{children}</div>;
}

export function Fact({ icon, label, children }: { icon?: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="lfact">
      <span className="lfact__label">
        {icon}
        {label}
      </span>
      <span className="lfact__items">{children}</span>
    </div>
  );
}

export const Chip = ({ children }: { children: ReactNode }) => <span className="lchip">{children}</span>;

export function CardFoot({ links, action }: { links?: ReactNode; action?: ReactNode }) {
  return (
    <footer className="lcard__foot">
      <div className="lcard__links">{links}</div>
      {action && <div className="lcard__action">{action}</div>}
    </footer>
  );
}
