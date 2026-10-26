import { Skeleton } from "../../../components/ui";

/** Square-cornered loading placeholders shaped like this page's cards. */

export function KpiSkeletons({ label = "Loading your royalty figures…" }: { label?: string }) {
  return (
    <div className="ah-kpis" role="status">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div className="ui-card ah-skel-card" key={i}>
          <Skeleton width="50%" height={12} radius={0} />
          <Skeleton width="40%" height={28} radius={0} />
          <Skeleton width="75%" height={10} radius={0} />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div className="ah-skel-list" role="status">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="ah-skel-list__row" key={i}>
          <div className="ah-skel-list__text">
            <Skeleton width={`${72 - (i % 3) * 12}%`} height={12} radius={0} />
            <Skeleton width={`${44 - (i % 2) * 10}%`} height={10} radius={0} />
          </div>
          <Skeleton width={64} height={20} radius={0} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ label = "Loading chart…" }: { label?: string }) {
  return (
    <div className="ah-skel-chart" role="status">
      <span className="ui-sr-only">{label}</span>
      <Skeleton width={160} height={160} radius={0} />
      <div className="ah-skel-chart__lines">
        <Skeleton width="80%" height={12} radius={0} />
        <Skeleton width="65%" height={12} radius={0} />
        <Skeleton width="72%" height={12} radius={0} />
      </div>
    </div>
  );
}
