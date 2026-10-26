import type { AdminStatsDto } from "@bookleaf/shared";
import type { ReactNode } from "react";
import { useAdminStats } from "../../api/hooks";
import { formatCount, formatPercent, formatUSD } from "../../lib/format";

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "danger" | "warning";
  /** Clicking applies the matching queue filter. */
  onClick?: () => void;
}

function Stat({ label, value, sub, tone, onClick }: StatProps) {
  const body = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {sub && <span className="stat__sub">{sub}</span>}
    </>
  );
  const className = `stat card ${tone ? `stat--${tone}` : ""}`;
  return onClick ? (
    <button type="button" className={`${className} stat--button`} onClick={onClick} title="Show these tickets">
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function AiStat({ ai }: { ai: AdminStatsDto["ai"] }) {
  return (
    <Stat
      label="AI assistant"
      tone={ai.available ? undefined : "warning"}
      value={
        <span className={ai.available ? "text-success" : "text-warning"}>{ai.available ? "Available" : "Degraded"}</span>
      }
      sub={
        <>
          {formatCount(ai.calls24h)} calls · {formatUSD(ai.estimatedCostUsd24h)} (24h)
          {ai.failures24h > 0 && ` · ${formatCount(ai.failures24h)} failed`}
          <br />
          Category agreement {ai.categoryAgreement === null ? "—" : formatPercent(ai.categoryAgreement)}
          {!ai.available && <> · rules &amp; templates in use</>}
        </>
      }
    />
  );
}

interface StatsStripProps {
  onShowStatus: (status: "open" | "in_progress") => void;
  onShowUrgent: () => void;
  onShowUnassigned: () => void;
}

export function StatsStrip({ onShowStatus, onShowUrgent, onShowUnassigned }: StatsStripProps) {
  const { data } = useAdminStats();
  if (!data) return <div className="stat-grid stat-grid--admin skeleton-block" aria-hidden="true" />;
  const { critical, high } = data.openByPriority;
  return (
    <section className="stat-grid stat-grid--admin" aria-label="Queue overview">
      <Stat label="Open" value={formatCount(data.byStatus.open)} onClick={() => onShowStatus("open")} />
      <Stat label="In progress" value={formatCount(data.byStatus.in_progress)} onClick={() => onShowStatus("in_progress")} />
      <Stat
        label="Critical / High"
        tone={critical > 0 ? "danger" : undefined}
        value={
          <>
            <span className={critical > 0 ? "text-danger" : undefined}>{formatCount(critical)}</span>
            <span className="muted"> / {formatCount(high)}</span>
          </>
        }
        sub="open tickets"
        onClick={onShowUrgent}
      />
      <Stat
        label="Unassigned"
        value={formatCount(data.unassignedOpen)}
        tone={data.unassignedOpen > 0 ? "warning" : undefined}
        onClick={onShowUnassigned}
      />
      <Stat
        label="SLA breached"
        value={formatCount(data.slaBreached)}
        tone={data.slaBreached > 0 ? "danger" : undefined}
        sub="no first reply in time"
      />
      <AiStat ai={data.ai} />
    </section>
  );
}
