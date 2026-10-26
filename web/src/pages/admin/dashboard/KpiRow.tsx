import type { TrendDto } from "@bookleaf/shared";
import { useId } from "react";
import { useAdminDashboard } from "../../../api/hooks";
import { KpiCard, SkeletonCard, type KpiCardProps, type Tone } from "../../../components/ui";
import { CardError } from "./DashCard";
import { formatHours, formatInt, percentChange } from "./format";

const VS_PREVIOUS = "vs previous 7 days";

/** Footnote for a trend: the comparison window, or why there is no delta. */
function trendFootnote(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "New this week (none in the previous 7 days)" : "None this week or the previous 7 days";
  return VS_PREVIOUS;
}

function trendKpi(label: string, trend: TrendDto, tone: Tone, icon: string): KpiCardProps {
  const change = percentChange(trend.total, trend.previousTotal);
  return {
    label,
    value: formatInt(trend.total),
    delta: change === null ? null : { value: change },
    series: trend.daily,
    tone,
    icon,
    footnote: trendFootnote(trend.total, trend.previousTotal),
  };
}

/** Four headline KPIs for the 7-day window. */
export function KpiRow() {
  const headingId = useId();
  const { data, isPending, isError, refetch } = useAdminDashboard();

  let body;
  if (isPending) {
    body = Array.from({ length: 4 }, (_, i) => (
      <div className="ad-span-3" key={i}>
        <SkeletonCard label="Loading key figures…" />
      </div>
    ));
  } else if (isError || !data) {
    body = (
      <div className="ui-card ad-span-12">
        <CardError what="the key figures" onRetry={() => void refetch()} />
      </div>
    );
  } else {
    const frt = data.avgFirstResponseHours;
    const frtChange = percentChange(frt.value, frt.previous);
    const cards: KpiCardProps[] = [
      trendKpi("New tickets · 7 days", data.created, "primary", "+"),
      trendKpi("Replies sent · 7 days", data.replies, "info", "↩"),
      {
        label: "Avg first response",
        value: frt.value === null ? null : formatHours(frt.value),
        delta: frtChange === null ? null : { value: frtChange, goodWhen: "down" },
        tone: "warning",
        icon: "⏱",
        help: "Average time from when a ticket is created to the first reply from an admin, over tickets created in the last 7 days that have been answered. Lower is better.",
        footnote:
          frt.value === null
            ? "No answered tickets this week yet"
            : frtChange === null
              ? "Nothing to compare with in the previous 7 days"
              : VS_PREVIOUS,
      },
      trendKpi("Resolved · 7 days", data.resolved, "success", "✓"),
    ];
    body = cards.map((card) => (
      <div className="ad-span-3" key={card.label}>
        <KpiCard {...card} />
      </div>
    ));
  }

  return (
    <section className="ad-grid ad-span-12" aria-labelledby={headingId}>
      <h2 id={headingId} className="ui-sr-only">
        Key figures for the last 7 days
      </h2>
      {body}
    </section>
  );
}
