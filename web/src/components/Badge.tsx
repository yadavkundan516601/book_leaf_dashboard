import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type ClassificationDto,
  type ClassificationSource,
  type TicketPriority,
  type TicketStatus,
} from "@bookleaf/shared";
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "orange" | "muted";

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<TicketStatus, BadgeTone> = {
  open: "info",
  in_progress: "warning",
  resolved: "success",
  closed: "muted",
};

export const StatusBadge = ({ status }: { status: TicketStatus }) => (
  <Badge tone={STATUS_TONE[status]}>{TICKET_STATUS_LABELS[status]}</Badge>
);

const PRIORITY_TONE: Record<TicketPriority, BadgeTone> = {
  critical: "danger",
  high: "orange",
  medium: "warning",
  low: "muted",
};

export const PriorityBadge = ({ priority }: { priority: TicketPriority | null }) =>
  priority ? <Badge tone={PRIORITY_TONE[priority]}>{TICKET_PRIORITY_LABELS[priority]}</Badge> : <Badge>—</Badge>;

const SOURCE_LABEL: Record<ClassificationSource, string> = { ai: "AI", rules: "Rules", admin: "Admin" };
const SOURCE_TITLE: Record<ClassificationSource, string> = {
  ai: "Set by the AI classifier",
  rules: "Set by keyword rules (AI was unavailable)",
  admin: "Set manually by an agent",
};

export const SourceChip = ({ source }: { source: ClassificationSource | null }) =>
  source ? (
    <span className={`source-chip source-chip--${source}`} title={SOURCE_TITLE[source]}>
      {SOURCE_LABEL[source]}
    </span>
  ) : null;

/** Category plus where it came from; shows a pending state while the classifier is still running. */
export function CategoryChip({ classification }: { classification: ClassificationDto }) {
  if (classification.state === "pending") {
    return <span className="category-chip category-chip--pending">Classifying…</span>;
  }
  if (!classification.category) return <span className="category-chip">Uncategorised</span>;
  return (
    <span className="category-chip">
      {TICKET_CATEGORY_LABELS[classification.category]}
      <SourceChip source={classification.categorySource} />
    </span>
  );
}

/** Book production status: live books are green, anything in production is amber. */
export const BookStatusBadge = ({ status, isPublished }: { status: string; isPublished: boolean }) => (
  <Badge tone={isPublished ? "success" : "warning"}>{status}</Badge>
);
