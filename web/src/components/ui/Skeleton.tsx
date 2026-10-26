import type { CSSProperties } from "react";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
}

/** Shimmering placeholder block; decorative (wrap groups in a Loading status, as the variants below do). */
export function Skeleton({ width = "100%", height = 12, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={["ui-skeleton", className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

interface LoadingProps {
  /** Text announced to screen readers (default "Loading…"). */
  label?: string;
}

/** Paragraph-shaped placeholder: several lines, the last one shorter. */
export function SkeletonText({ lines = 3, label = "Loading…" }: LoadingProps & { lines?: number }) {
  return (
    <div className="ui-skeleton-text" role="status">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 && lines > 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

/** Placeholder shaped like a KPI or content card. */
export function SkeletonCard({ label = "Loading…" }: LoadingProps) {
  return (
    <div className="ui-card ui-skeleton-card" role="status">
      <span className="ui-sr-only">{label}</span>
      <Skeleton width="45%" height={12} />
      <Skeleton width="35%" height={28} radius={8} />
      <Skeleton width="80%" height={10} />
    </div>
  );
}

/** List placeholder: rows with an avatar, two text lines and a status pill. */
export function SkeletonRows({ rows = 5, label = "Loading…" }: LoadingProps & { rows?: number }) {
  return (
    <div className="ui-skeleton-rows" role="status">
      <span className="ui-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="ui-skeleton-rows__row" key={i}>
          <Skeleton width={32} height={32} radius="50%" />
          <div className="ui-skeleton-rows__text">
            <Skeleton width={`${70 - (i % 3) * 12}%`} height={12} />
            <Skeleton width={`${45 - (i % 2) * 10}%`} height={10} />
          </div>
          <Skeleton width={64} height={20} radius={999} />
        </div>
      ))}
    </div>
  );
}
