import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_SORTS,
  TICKET_STATUSES,
  type TicketCategory,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
} from "@bookleaf/shared";
import type { TicketListParams } from "../../api/hooks";

/** The queue opens on work that still needs doing. */
export const DEFAULT_STATUSES: TicketStatus[] = ["open", "in_progress"];
/** URL value meaning "every status" (an absent param means the default above). */
const ALL = "all";
const PAGE_SIZE = 25;

export interface QueueFilters {
  statuses: TicketStatus[];
  priorities: TicketPriority[];
  category: TicketCategory | null;
  assignee: string | null;
  from: string;
  to: string;
  q: string;
  sort: TicketSort;
  page: number;
}

const pick = <T extends string>(allowed: readonly T[], values: string[]) =>
  values.filter((v): v is T => (allowed as readonly string[]).includes(v));

export function readFilters(params: URLSearchParams): QueueFilters {
  const rawStatus = params.getAll("status");
  const category = params.get("category");
  const sort = params.get("sort");
  return {
    statuses: rawStatus.length === 0 ? DEFAULT_STATUSES : rawStatus.includes(ALL) ? [] : pick(TICKET_STATUSES, rawStatus),
    priorities: pick(TICKET_PRIORITIES, params.getAll("priority")),
    category: pick(TICKET_CATEGORIES, category ? [category] : [])[0] ?? null,
    assignee: params.get("assignee"),
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    q: params.get("q") ?? "",
    sort: pick(TICKET_SORTS, sort ? [sort] : [])[0] ?? "urgency",
    page: Math.max(1, Number(params.get("page")) || 1),
  };
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function writeFilters(f: QueueFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.statuses.length === 0) p.set("status", ALL);
  else if (!sameSet(f.statuses, DEFAULT_STATUSES)) f.statuses.forEach((s) => p.append("status", s));
  f.priorities.forEach((v) => p.append("priority", v));
  if (f.category) p.set("category", f.category);
  if (f.assignee) p.set("assignee", f.assignee);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.sort !== "urgency") p.set("sort", f.sort);
  if (f.page > 1) p.set("page", String(f.page));
  return p;
}

export function toListQuery(f: QueueFilters): TicketListParams {
  return {
    status: f.statuses.length ? f.statuses : undefined,
    priority: f.priorities.length ? f.priorities : undefined,
    category: f.category ?? undefined,
    assignee: f.assignee ?? undefined,
    from: f.from || undefined,
    to: f.to || undefined,
    q: f.q.trim() || undefined,
    sort: f.sort,
    page: f.page,
    pageSize: PAGE_SIZE,
  };
}

/** True when anything other than sort/page narrows the queue away from its default view. */
export const hasCustomFilters = (params: URLSearchParams) =>
  [...params.keys()].some((k) => k !== "page" && k !== "sort");
