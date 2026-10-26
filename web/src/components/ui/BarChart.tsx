import type { ReactNode } from "react";
import { chartPalette, formatNumber } from "./tone";

export interface BarItem {
  label: string;
  value: number;
  /** CSS colour; defaults to the primary token. */
  color?: string;
}

export interface BarChartProps {
  items: readonly BarItem[];
  orientation?: "horizontal" | "vertical";
  /** Scale maximum (default: the largest value). */
  max?: number;
  valueFormatter?: (value: number) => string;
  /** Chart name used in the accessible summary and data table caption. */
  label?: string;
  /** Plot height in px for vertical charts. */
  height?: number;
  emptyMessage?: ReactNode;
}

/** Horizontal or vertical bar chart with truncating labels, an aria summary and a hidden data table. */
export function BarChart({
  items,
  orientation = "horizontal",
  max,
  valueFormatter = formatNumber,
  label = "Bar chart",
  height = 200,
  emptyMessage = "Nothing to show yet.",
}: BarChartProps) {
  if (items.length === 0) {
    return <p className="ui-chart-empty">{emptyMessage}</p>;
  }

  const values = items.map((i) => (Number.isFinite(i.value) ? Math.max(0, i.value) : 0));
  const scaleMax = max && max > 0 ? max : Math.max(...values, 0) || 1;
  const top = items
    .map((item, i) => ({ label: item.label, value: values[i]! }))
    .sort((a, b) => b.value - a.value);
  const shown = top.slice(0, 3).map((t) => `${t.label} ${valueFormatter(t.value)}`);
  const rest = items.length - shown.length;
  const summary = `${label}: ${items.length === 1 ? "" : "highest "}${shown.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}.`;

  return (
    <div className={`ui-bars ui-bars--${orientation}`}>
      <div
        className="ui-bars__plot"
        role="img"
        aria-label={summary}
        style={orientation === "vertical" ? { height } : undefined}
      >
        {items.map((item, i) => {
          const pct = Math.min(100, (values[i]! / scaleMax) * 100);
          const color = item.color ?? chartPalette[0]!;
          const size = orientation === "vertical" ? { height: `${pct}%` } : { width: `${pct}%` };
          return (
            <div className="ui-bars__row" key={i}>
              <span className="ui-bars__label" title={item.label}>
                {item.label}
              </span>
              <span className="ui-bars__track">
                <span className="ui-bars__fill" style={{ ...size, background: color }} />
              </span>
              <span className="ui-bars__value">{valueFormatter(values[i]!)}</span>
            </div>
          );
        })}
      </div>
      <table className="ui-sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <th scope="row">{item.label}</th>
              <td>{valueFormatter(values[i]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
