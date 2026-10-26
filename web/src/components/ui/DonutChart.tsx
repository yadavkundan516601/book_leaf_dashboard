import type { ReactNode } from "react";
import { chartPalette, formatNumber, formatPercent } from "./tone";

export interface DonutSegment {
  label: string;
  value: number;
  /** CSS colour; defaults to the token palette in order. */
  color?: string;
}

export interface DonutChartProps {
  segments: readonly DonutSegment[];
  /** Small caption under the centre value (default "Total"). */
  centerLabel?: string;
  /** Centre figure (default: the formatted total). */
  centerValue?: ReactNode;
  /** Chart name used in the accessible summary, e.g. "Open tickets by status". */
  label?: string;
  size?: number;
  thickness?: number;
  emptyMessage?: ReactNode;
}

/** SVG donut with an accessible legend listing counts and percentages; shows an empty ring when total is 0. */
export function DonutChart({
  segments,
  centerLabel = "Total",
  centerValue,
  label = "Breakdown",
  size = 180,
  thickness = 22,
  emptyMessage = "Nothing to show yet.",
}: DonutChartProps) {
  const rows = segments.map((s, i) => ({
    label: s.label,
    value: Math.max(0, Number.isFinite(s.value) ? s.value : 0),
    color: s.color ?? chartPalette[i % chartPalette.length]!,
  }));
  const total = rows.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const visible = rows.filter((s) => s.value > 0).length;

  const summary =
    total === 0
      ? `${label}: no data.`
      : `${label}: total ${formatNumber(total)}. ` +
        rows.map((s) => `${s.label} ${formatNumber(s.value)} (${formatPercent(s.value, total)})`).join(", ") +
        ".";

  let offset = 0;
  const arcs = rows.map((s, i) => {
    if (s.value <= 0 || total === 0) return null;
    const len = (s.value / total) * circumference;
    const gap = visible > 1 ? Math.min(2, len * 0.3) : 0;
    const arc = (
      <circle
        key={i}
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={thickness}
        strokeDasharray={`${len - gap} ${circumference - len + gap}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${c} ${c})`}
      >
        <title>{`${s.label}: ${formatNumber(s.value)} (${formatPercent(s.value, total)})`}</title>
      </circle>
    );
    offset += len;
    return arc;
  });

  return (
    <div className="ui-donut">
      <div className="ui-donut__chart" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={summary}>
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-2, #f8fafc)" strokeWidth={thickness} />
          {total === 0 && (
            <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border, #e6ebf2)" strokeWidth={thickness} strokeDasharray="6 6" />
          )}
          {arcs}
        </svg>
        <div className="ui-donut__center" aria-hidden="true">
          <span className="ui-donut__value">{centerValue ?? formatNumber(total)}</span>
          <span className="ui-donut__label">{centerLabel}</span>
        </div>
      </div>
      {total === 0 ? (
        <p className="ui-chart-empty">{emptyMessage}</p>
      ) : (
        <ul className="ui-legend" aria-label={`${label} legend`}>
          {rows.map((s, i) => (
            <li key={i} className="ui-legend__item">
              <span className="ui-legend__swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="ui-legend__label" title={s.label}>
                {s.label}
              </span>
              <span className="ui-legend__count">{formatNumber(s.value)}</span>
              <span className="ui-legend__pct">{formatPercent(s.value, total)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
