import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useAdminTickets, useTeam } from "../../api/hooks";
import { useAuth } from "../../auth/AuthProvider";
import { PageHeader, Tabs } from "../../components/ui";
import { formatCount } from "../../lib/format";
import "../../styles/admin-queue.css";
import { FilterPanel, SORT_LABELS } from "./queue/FilterPanel";
import { QueueList } from "./queue/QueueList";
import {
  QUICK_VIEWS,
  activeFilterChips,
  advancedFilterCount,
  matchQuickView,
  quickViewPatch,
  readFilters,
  toListQuery,
  writeFilters,
  type QueueFilters,
  type QuickViewId,
} from "./queueFilters";
import { StatsStrip } from "./StatsStrip";

const PANEL_ID = "aq-filters";

export function QueuePage() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const { user } = useAuth();
  const team = useTeam();
  const { data, isPending, isFetching, error, refetch } = useAdminTickets(toListQuery(filters));
  const [panelOpen, setPanelOpen] = useState(false);

  // Functional form so a delayed update (search debounce) never overwrites a newer filter change.
  const update = (patch: Partial<QueueFilters>, opts?: { replace?: boolean }) =>
    setParams((prev) => writeFilters({ ...readFilters(prev), page: 1, ...patch }), opts);
  // "Clear all" keeps the chosen sort: it is an ordering preference, not a filter.
  const clearAll = () => update({ ...quickViewPatch("active"), q: "" });

  // Search is typed locally and pushed to the URL after a pause; back/forward navigation syncs it back.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch((s) => (s.trim() === filters.q ? s : filters.q)), [filters.q]);
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const timer = setTimeout(() => update({ q: search }, { replace: true }), 350);
    return () => clearTimeout(timer);
  }, [search]); // only the typed text restarts the debounce

  useEffect(() => {
    document.title = "Ticket queue · BookLeaf Support";
  }, []);

  const view = matchQuickView(filters);
  const chips = activeFilterChips(filters, (id) => team.data?.find((m) => m.id === id)?.name ?? "a teammate");
  const advancedCount = advancedFilterCount(filters);
  const total = data?.total;

  return (
    <div className="aq-page">
      <PageHeader
        title="Ticket queue"
        breadcrumbs={[{ label: "Dashboard", to: "/admin/dashboard" }, { label: "Ticket queue" }]}
        subtitle={
          total === undefined
            ? "Loading tickets…"
            : `${formatCount(total)} ${total === 1 ? "ticket matches" : "tickets match"} this view · ${SORT_LABELS[filters.sort].toLowerCase()}.`
        }
      />

      <StatsStrip onApply={(patch) => update(patch)} />

      <div className="aq-toolbar">
        <div className="aq-tabs">
          <Tabs<QuickViewId | "custom">
            label="Quick views"
            tabs={QUICK_VIEWS.map((v) => ({ id: v.id, label: v.label }))}
            value={view ?? "custom"}
            onChange={(id) => {
              if (id !== "custom") update(quickViewPatch(id));
            }}
          />
        </div>

        <div className="aq-searchbar">
          <div className="aq-search">
            <label htmlFor="aq-q" className="ui-sr-only">
              Search tickets
            </label>
            <input
              id="aq-q"
              type="search"
              placeholder="Search reference, subject, author or book"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn aq-filters-btn"
            aria-expanded={panelOpen}
            aria-controls={PANEL_ID}
            onClick={() => setPanelOpen((o) => !o)}
          >
            Filters
            {advancedCount > 0 && (
              <span className="aq-filters-btn__badge">
                {advancedCount}
                <span className="ui-sr-only"> active</span>
              </span>
            )}
          </button>
        </div>

        {panelOpen && (
          <FilterPanel id={PANEL_ID} filters={filters} team={team.data} currentUserId={user?.id} onChange={(patch) => update(patch)} />
        )}

        {chips.length > 0 && (
          <div className="aq-chips" aria-label="Active filters" role="group">
            {chips.map((chip) => (
              <span key={chip.key} className="aq-chip">
                {chip.label}
                <button
                  type="button"
                  className="aq-chip__remove"
                  aria-label={`Remove filter ${chip.label}`}
                  onClick={() => update(chip.remove)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))}
            <button type="button" className="link-button aq-chips__clear" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="aq-status-line" role="status">
        {isFetching && !isPending ? "Updating…" : ""}
      </div>

      <QueueList
        data={data}
        isPending={isPending}
        error={error}
        onRetry={() => void refetch()}
        filtered={chips.length > 0}
        onClearFilters={clearAll}
        onShowResolved={() => update(quickViewPatch("resolved"))}
        onPage={(page) => update({ page })}
      />
    </div>
  );
}
