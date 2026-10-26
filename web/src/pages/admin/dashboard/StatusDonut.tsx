import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from "@bookleaf/shared";
import { useAdminStats } from "../../../api/hooks";
import { DonutChart, Skeleton } from "../../../components/ui";
import { CardError, DashCard } from "./DashCard";
import { formatInt } from "./format";

const STATUS_COLOUR: Record<TicketStatus, string> = {
  open: "var(--blue)",
  in_progress: "var(--warning)",
  resolved: "var(--success)",
  closed: "var(--muted)",
};

/** Every ticket split by status. */
export function StatusDonut() {
  const { data, isPending, isError, refetch } = useAdminStats();

  let body;
  if (isPending) {
    body = (
      <div className="ad-donut-skeleton" role="status">
        <span className="ui-sr-only">Loading tickets by status…</span>
        <Skeleton width={160} height={160} radius={0} />
        <Skeleton width="80%" height={12} radius={0} />
        <Skeleton width="70%" height={12} radius={0} />
      </div>
    );
  } else if (isError || !data) {
    body = <CardError what="tickets by status" onRetry={() => void refetch()} />;
  } else {
    const segments = TICKET_STATUSES.map((s) => ({
      label: TICKET_STATUS_LABELS[s],
      value: data.byStatus[s] ?? 0,
      color: STATUS_COLOUR[s],
    }));
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    body = (
      <DonutChart
        segments={segments}
        label="Tickets by status"
        centerLabel="Tickets"
        centerValue={formatInt(total)}
        emptyMessage="No tickets yet. They will appear here once authors start asking questions."
      />
    );
  }

  return (
    <DashCard title="Tickets by status" subtitle="All tickets, including resolved and closed" span="ad-span-4">
      {body}
    </DashCard>
  );
}
