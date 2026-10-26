import { Skeleton } from "../../../components/ui";

/** Square-cornered placeholders shaped like book cards. */
export function BookCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="card-list" role="status">
      <span className="ui-sr-only">Loading your books…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="lcard hb-skel-book" key={i}>
          <Skeleton width={`${48 - (i % 2) * 12}%`} height={16} radius={0} />
          <div className="hb-skel-book__row">
            <Skeleton width={96} height={20} radius={0} />
            <Skeleton width="30%" height={28} radius={0} />
            <Skeleton width={110} height={28} radius={0} />
          </div>
          <Skeleton width="60%" height={12} radius={0} />
        </div>
      ))}
    </div>
  );
}
