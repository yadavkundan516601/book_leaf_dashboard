import { TICKET_CATEGORY_LABELS } from "@bookleaf/shared";
import { useState } from "react";
import { Link } from "react-router";
import { useAdminDashboard } from "../../../api/hooks";
import { Avatar, BarChart, ProgressBar, SkeletonText, TabPanel, Tabs } from "../../../components/ui";
import { CardError, DashCard } from "./DashCard";
import { firstName, formatHours, formatInt } from "./format";

/** Top agent by tickets resolved this week, plus how the rest of the team compares. */
export function BestAgent() {
  const { data, isPending, isError, refetch } = useAdminDashboard();

  let body;
  if (isPending) {
    body = <SkeletonText lines={5} label="Loading the best agent of the week…" />;
  } else if (isError || !data) {
    body = <CardError what="the agent leaderboard" onRetry={() => void refetch()} />;
  } else {
    const [top, ...others] = data.agents;
    if (!top || top.resolved7d === 0) {
      body = (
        <div className="ad-empty">
          <p className="ad-empty__title">No resolved tickets yet this week</p>
          <p className="ad-muted">The agent who resolves the most tickets in the last 7 days will be celebrated here.</p>
          <Link to="/admin/tickets?assignee=me" className="btn btn--sm">
            Open my tickets
          </Link>
        </div>
      );
    } else {
      body = (
        <>
          <div className="ad-best">
            <Avatar name={top.name} size="lg" decorative />
            <p className="ad-best__greeting">Congratulations, {firstName(top.name)}!</p>
            <p className="ad-best__name ad-muted">{top.name}</p>
            <p className="ad-best__figure">
              <span className="ad-best__number">{formatInt(top.resolved7d)}</span>
              <span className="ad-muted"> tickets resolved in the last 7 days</span>
            </p>
            <dl className="ad-best__stats">
              <div>
                <dt>Replies · 7 days</dt>
                <dd>{formatInt(top.replies7d)}</dd>
              </div>
              <div>
                <dt>Avg first response</dt>
                <dd>{formatHours(top.avgFirstResponseHours)}</dd>
              </div>
            </dl>
          </div>
          {others.length > 0 && (
            <div className="ad-best__others">
              <h3 className="ad-subheading">Rest of the team · resolved in 7 days</h3>
              {others.map((a) => (
                <ProgressBar
                  key={a.id}
                  label={a.name}
                  value={a.resolved7d}
                  max={top.resolved7d}
                  tone="info"
                  valueText={`${formatInt(a.resolved7d)} resolved`}
                />
              ))}
            </div>
          )}
        </>
      );
    }
  }

  return (
    <DashCard title="Best agent of the week" span="ad-span-4">
      {body}
    </DashCard>
  );
}

type Range = "7d" | "30d";
const WINDOW_TABS = [
  { id: "7d" as const, label: "7 days" },
  { id: "30d" as const, label: "30 days" },
];
const TABS_ID = "ad-resolved-by-agent";

/** Resolved tickets per agent over 7 or 30 days. */
export function ResolvedByAgent() {
  const { data, isPending, isError, refetch } = useAdminDashboard();
  const [range, setRange] = useState<Range>("7d");
  const days = range === "7d" ? 7 : 30;

  let body;
  if (isPending) {
    body = <SkeletonText lines={5} label="Loading resolved tickets by agent…" />;
  } else if (isError || !data) {
    body = <CardError what="resolved tickets by agent" onRetry={() => void refetch()} />;
  } else {
    const items = data.agents.map((a) => ({ label: a.name, value: range === "7d" ? a.resolved7d : a.resolved30d }));
    body = (
      <TabPanel tabsId={TABS_ID} value={range}>
        <BarChart
          label={`Tickets resolved by agent, last ${days} days`}
          items={items.some((i) => i.value > 0) ? items : []}
          valueFormatter={formatInt}
          emptyMessage={
            data.agents.length === 0
              ? "No agents on the team yet."
              : `No tickets were resolved in the last ${days} days.`
          }
        />
      </TabPanel>
    );
  }

  return (
    <DashCard
      title="Resolved by agent"
      subtitle={`Tickets each agent resolved in the last ${days} days`}
      span="ad-span-4"
      actions={<Tabs id={TABS_ID} label="Time window" tabs={WINDOW_TABS} value={range} onChange={setRange} />}
    >
      {body}
    </DashCard>
  );
}

/** Unresolved tickets per category, with the not-yet-classified bucket last. */
export function OpenByCategory() {
  const { data, isPending, isError, refetch } = useAdminDashboard();

  let body;
  if (isPending) {
    body = <SkeletonText lines={6} label="Loading open tickets by category…" />;
  } else if (isError || !data) {
    body = <CardError what="open tickets by category" onRetry={() => void refetch()} />;
  } else {
    const rows = data.unresolvedByCategory.filter((c) => c.category !== null || c.count > 0);
    const total = rows.reduce((sum, c) => sum + c.count, 0);
    body =
      total === 0 ? (
        <div className="ad-empty">
          <p className="ad-empty__title">No open tickets</p>
          <p className="ad-muted">Every ticket is resolved or closed. New ones will be counted here by category.</p>
        </div>
      ) : (
        <>
          <BarChart
            label="Open tickets by category"
            items={rows.map((c) => ({
              label: c.category ? TICKET_CATEGORY_LABELS[c.category] : "Still classifying",
              value: c.count,
              color: c.category ? undefined : "var(--muted)",
            }))}
            valueFormatter={formatInt}
          />
          <ul className="ad-category-links" aria-label="Open tickets in the queue by category">
            {rows
              .filter((c) => c.category !== null && c.count > 0)
              .map((c) => (
                <li key={c.category}>
                  <Link to={`/admin/tickets?category=${c.category}`} className="ad-chip-link">
                    {TICKET_CATEGORY_LABELS[c.category!]} <span className="ad-muted">({formatInt(c.count)})</span>
                  </Link>
                </li>
              ))}
          </ul>
        </>
      );
  }

  return (
    <DashCard title="Open tickets by category" subtitle="Open and in-progress tickets" span="ad-span-4">
      {body}
    </DashCard>
  );
}
