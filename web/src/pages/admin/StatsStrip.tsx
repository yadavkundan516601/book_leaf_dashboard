import type { AdminStatsDto } from "@bookleaf/shared";
import { useAdminStats } from "../../api/hooks";
import { Skeleton } from "../../components/ui";
import { formatCount, formatPercent, formatUSD } from "../../lib/format";
import { quickViewPatch, type QueueFilters } from "./queueFilters";

type ChipTone = "danger" | "warning" | undefined;

interface CountChipProps {
  label: string;
  count: number;
  tone?: ChipTone;
  /** What clicking shows, read out to screen readers and shown as a tooltip. */
  hint: string;
  onClick: () => void;
}

function CountChip({ label, count, tone, hint, onClick }: CountChipProps) {
  return (
    <button
      type="button"
      className={`aq-stat${tone && count > 0 ? ` aq-stat--${tone}` : ""}`}
      onClick={onClick}
      title={hint}
      aria-label={`${formatCount(count)} ${label}. ${hint}`}
    >
      <span className="aq-stat__count">{formatCount(count)}</span>
      <span className="aq-stat__label">{label}</span>
    </button>
  );
}

function AiChip({ ai }: { ai: AdminStatsDto["ai"] }) {
  const detail = [
    `${formatCount(ai.calls24h)} calls · ${formatUSD(ai.estimatedCostUsd24h)} in the last 24h`,
    ai.failures24h > 0 ? `${formatCount(ai.failures24h)} failed` : null,
    `category agreement ${ai.categoryAgreement === null ? "not measured yet" : formatPercent(ai.categoryAgreement)}`,
    ai.available ? null : "keyword rules and reply templates are in use",
  ]
    .filter(Boolean)
    .join("; ");
  return (
    <span className={`aq-ai aq-ai--${ai.available ? "ok" : "degraded"}`} title={detail}>
      <span className="aq-ai__dot" aria-hidden="true" />
      AI {ai.available ? "available" : "degraded"}
      <span className="ui-sr-only">: {detail}</span>
    </span>
  );
}

interface StatsStripProps {
  /** Applies the filter patch for the chip that was pressed. */
  onApply: (patch: Partial<QueueFilters>) => void;
}

/** Compact live counts above the queue; each chip switches the list to the matching tickets. */
export function StatsStrip({ onApply }: StatsStripProps) {
  const { data } = useAdminStats();
  if (!data) {
    return (
      <div className="aq-stats" role="status">
        <span className="ui-sr-only">Loading queue counts…</span>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} width={112} height={34} radius={0} />
        ))}
      </div>
    );
  }
  const { critical, high } = data.openByPriority;
  const active = quickViewPatch("active");
  return (
    <section className="aq-stats" aria-label="Queue overview">
      <CountChip label="open" count={data.byStatus.open} hint="Show open tickets" onClick={() => onApply({ ...active, statuses: ["open"] })} />
      <CountChip
        label="in progress"
        count={data.byStatus.in_progress}
        hint="Show tickets in progress"
        onClick={() => onApply({ ...active, statuses: ["in_progress"] })}
      />
      <CountChip
        label="critical / high"
        count={critical + high}
        tone={critical > 0 ? "danger" : "warning"}
        hint={`${formatCount(critical)} critical and ${formatCount(high)} high. Show them`}
        onClick={() => onApply(quickViewPatch("urgent"))}
      />
      <CountChip
        label="unassigned"
        count={data.unassignedOpen}
        tone="warning"
        hint="Show active tickets nobody owns"
        onClick={() => onApply(quickViewPatch("unassigned"))}
      />
      <CountChip
        label="SLA breached"
        count={data.slaBreached}
        tone="danger"
        hint="No first reply within the target. Shows active critical and high tickets, where breaches concentrate; breached rows are marked in red"
        onClick={() => onApply(quickViewPatch("urgent"))}
      />
      <AiChip ai={data.ai} />
    </section>
  );
}
