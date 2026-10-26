import {
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
} from "@bookleaf/shared";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("en-IN");

export const formatINR = (n: number) => inr.format(n);
export const formatUSD = (n: number) => usd.format(n);
export const formatCount = (n: number) => integer.format(n);
export const formatPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "20 Jun 2023". Date-only strings are calendar dates, so format them in UTC to avoid a day shift. */
export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(DATE_ONLY.test(value) ? { timeZone: "UTC" } : {}),
  });
}

/** "20 Jun 2023, 3:45 pm" */
export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function formatRelative(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

/** Ticket age from hours: "45m", "6h", "2d 4h". */
export function formatAge(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  const whole = Math.floor(hours);
  if (whole < 24) return `${whole}h`;
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VALUE_LABELS: Record<string, string> = {
  ...TICKET_STATUS_LABELS,
  ...TICKET_CATEGORY_LABELS,
  ...TICKET_PRIORITY_LABELS,
};

/** Human label for an enum value stored in the activity log; falls back to the raw value. */
export const labelForValue = (value: string) =>
  VALUE_LABELS[value] ??
  // Composite values such as "royalty_payments/high via ai" -> "Royalty & Payments · High via ai"
  value.replace(/[a-z]+(?:_[a-z]+)*/g, (w) => VALUE_LABELS[w] ?? w).replace(/\//g, " · ");

/** "status_changed" / "ticket.status_changed" -> "Status changed". */
export function humanizeEventType(type: string): string {
  const words = (type.split(".").pop() ?? type).replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
