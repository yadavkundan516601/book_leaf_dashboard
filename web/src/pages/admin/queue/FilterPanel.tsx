import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type AdminRefDto,
  type TicketCategory,
  type TicketSort,
} from "@bookleaf/shared";
import { useEffect, useState } from "react";
import { dateRangeError, type QueueFilters } from "../queueFilters";

export const SORT_LABELS: Record<TicketSort, string> = {
  urgency: "Most urgent first",
  newest: "Newest first",
  oldest: "Oldest first",
  updated: "Recently updated",
};

const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

interface FilterPanelProps {
  id: string;
  filters: QueueFilters;
  team: AdminRefDto[] | undefined;
  currentUserId: string | undefined;
  onChange: (patch: Partial<QueueFilters>) => void;
}

/** The advanced filters, revealed by the "Filters" button. Every control writes straight to the URL. */
export function FilterPanel({ id, filters, team, currentUserId, onChange }: FilterPanelProps) {
  // Dates are edited locally so an invalid range (from after to) is explained instead of being sent.
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  useEffect(() => {
    setFrom(filters.from);
    setTo(filters.to);
  }, [filters.from, filters.to]);
  const rangeError = dateRangeError(from, to);

  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    if (!dateRangeError(nextFrom, nextTo)) onChange({ from: nextFrom, to: nextTo });
  };

  return (
    <section id={id} className="aq-panel" aria-label="Advanced filters">
      <fieldset className="aq-panel__group">
        <legend>Status</legend>
        <div className="aq-toggles">
          {TICKET_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className="aq-toggle"
              aria-pressed={filters.statuses.includes(s)}
              onClick={() => onChange({ statuses: toggle(filters.statuses, s) })}
            >
              {TICKET_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <p className="field__hint">None selected shows every status.</p>
      </fieldset>

      <fieldset className="aq-panel__group">
        <legend>Priority</legend>
        <div className="aq-toggles">
          {TICKET_PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={`aq-toggle aq-toggle--${p}`}
              aria-pressed={filters.priorities.includes(p)}
              onClick={() => onChange({ priorities: toggle(filters.priorities, p) })}
            >
              {TICKET_PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
        <p className="field__hint">None selected shows every priority.</p>
      </fieldset>

      <div className="aq-panel__grid">
        <div className="field">
          <label htmlFor="aq-category">Category</label>
          <select
            id="aq-category"
            value={filters.category ?? ""}
            onChange={(e) => onChange({ category: (e.target.value || null) as TicketCategory | null })}
          >
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="aq-assignee">Assignee</label>
          <select id="aq-assignee" value={filters.assignee ?? ""} onChange={(e) => onChange({ assignee: e.target.value || null })}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {team
              ?.filter((m) => m.id !== currentUserId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="aq-from">Created from</label>
          <input
            id="aq-from"
            type="date"
            value={from}
            onChange={(e) => setRange(e.target.value, to)}
            aria-invalid={Boolean(rangeError)}
            aria-describedby={rangeError ? "aq-range-error" : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="aq-to">Created to</label>
          <input
            id="aq-to"
            type="date"
            value={to}
            onChange={(e) => setRange(from, e.target.value)}
            aria-invalid={Boolean(rangeError)}
            aria-describedby={rangeError ? "aq-range-error" : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="aq-sort">Sort</label>
          <select id="aq-sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as TicketSort })}>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rangeError && (
        <p id="aq-range-error" className="field__error" role="alert">
          {rangeError} The list still uses the last valid range.
        </p>
      )}
    </section>
  );
}
