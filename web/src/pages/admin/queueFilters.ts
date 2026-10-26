import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_SORTS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
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

// ---------------------------------------------------------------------------
// Quick views (the tabs above the queue)
// ---------------------------------------------------------------------------

/** The facets a quick view sets; search text, sort and page are left alone so they combine with any view. */
type ViewFacets = Pick<QueueFilters, "statuses" | "priorities" | "category" | "assignee" | "from" | "to">;

const NO_FACETS: ViewFacets = { statuses: DEFAULT_STATUSES, priorities: [], category: null, assignee: null, from: "", to: "" };

export const QUICK_VIEWS = [
  { id: "active", label: "All active", facets: NO_FACETS },
  { id: "mine", label: "Assigned to me", facets: { ...NO_FACETS, assignee: "me" } },
  { id: "unassigned", label: "Unassigned", facets: { ...NO_FACETS, assignee: "unassigned" } },
  { id: "urgent", label: "Critical & high", facets: { ...NO_FACETS, priorities: ["critical", "high"] } },
  { id: "resolved", label: "Resolved", facets: { ...NO_FACETS, statuses: ["resolved"] } },
  { id: "all", label: "All", facets: { ...NO_FACETS, statuses: [] } },
] as const satisfies readonly { id: string; label: string; facets: ViewFacets }[];

export type QuickViewId = (typeof QUICK_VIEWS)[number]["id"];

/** Filter patch that switches to a quick view (keeps search and sort, back to page 1). */
export function quickViewPatch(id: QuickViewId): Partial<QueueFilters> {
  const view = QUICK_VIEWS.find((v) => v.id === id) ?? QUICK_VIEWS[0];
  return { ...view.facets, statuses: [...view.facets.statuses], priorities: [...view.facets.priorities], page: 1 };
}

/** The quick view whose facets exactly match the current filters, or null for a custom combination. */
export function matchQuickView(f: QueueFilters): QuickViewId | null {
  const match = QUICK_VIEWS.find(
    ({ facets }) =>
      sameSet(f.statuses, facets.statuses) &&
      sameSet(f.priorities, facets.priorities) &&
      f.category === facets.category &&
      f.assignee === facets.assignee &&
      f.from === facets.from &&
      f.to === facets.to,
  );
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Active-filter chips and the "Filters" badge
// ---------------------------------------------------------------------------

export interface FilterChip {
  key: string;
  label: string;
  /** Patch that removes just this filter. */
  remove: Partial<QueueFilters>;
}

/** One removable chip per active filter, in the order the advanced panel lists them. */
export function activeFilterChips(f: QueueFilters, assigneeName: (id: string) => string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.statuses.length === 0) {
    chips.push({ key: "status-all", label: "Status: any", remove: { statuses: DEFAULT_STATUSES } });
  } else if (!sameSet(f.statuses, DEFAULT_STATUSES)) {
    for (const s of f.statuses) {
      const rest = f.statuses.filter((x) => x !== s);
      // Removing the last status goes back to the default (active) view rather than to "any status".
      chips.push({ key: `status-${s}`, label: `Status: ${TICKET_STATUS_LABELS[s]}`, remove: { statuses: rest.length ? rest : DEFAULT_STATUSES } });
    }
  }
  for (const p of f.priorities) {
    chips.push({ key: `priority-${p}`, label: `Priority: ${TICKET_PRIORITY_LABELS[p]}`, remove: { priorities: f.priorities.filter((x) => x !== p) } });
  }
  if (f.category) chips.push({ key: "category", label: `Category: ${TICKET_CATEGORY_LABELS[f.category]}`, remove: { category: null } });
  if (f.assignee) {
    const who = f.assignee === "me" ? "me" : f.assignee === "unassigned" ? "nobody" : assigneeName(f.assignee);
    chips.push({ key: "assignee", label: f.assignee === "unassigned" ? "Unassigned" : `Assigned to ${who}`, remove: { assignee: null } });
  }
  if (f.from) chips.push({ key: "from", label: `Created from ${f.from}`, remove: { from: "" } });
  if (f.to) chips.push({ key: "to", label: `Created to ${f.to}`, remove: { to: "" } });
  if (f.q.trim()) chips.push({ key: "q", label: `Search: “${f.q.trim()}”`, remove: { q: "" } });
  return chips;
}

/** How many advanced-panel controls differ from their defaults (shown as a badge on the Filters button). */
export function advancedFilterCount(f: QueueFilters): number {
  return [
    !sameSet(f.statuses, DEFAULT_STATUSES),
    f.priorities.length > 0,
    f.category !== null,
    f.assignee !== null,
    f.from !== "",
    f.to !== "",
    f.sort !== "urgency",
  ].filter(Boolean).length;
}

/** Inline validation for the created-date range; null when valid. */
export const dateRangeError = (from: string, to: string) =>
  from && to && from > to ? "“Created from” must be on or before “Created to”." : null;
