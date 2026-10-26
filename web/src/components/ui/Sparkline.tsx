import { toneColor, type Tone } from "./tone";

export interface SparklineProps {
  values: readonly number[];
  tone?: Tone;
  width?: number;
  height?: number;
  /** Shade the area under the line. */
  filled?: boolean;
  /** Accessible description; without it the sparkline is decorative (aria-hidden). */
  label?: string;
}

const PAD = 3;

/** Tiny inline SVG trend line; copes with empty, single-point and constant series. */
export function Sparkline({ values, tone = "primary", width = 120, height = 40, filled = false, label }: SparklineProps) {
  const color = toneColor[tone];
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const finite = values.filter((v) => Number.isFinite(v));
  const midY = height / 2;
  const box = { className: "ui-sparkline", width, height, viewBox: `0 0 ${width} ${height}`, ...a11y };

  if (finite.length === 0) {
    return (
      <svg {...box}>
        <line x1={PAD} x2={width - PAD} y1={midY} y2={midY} stroke="var(--border, #e6ebf2)" strokeWidth={2} strokeDasharray="4 4" />
      </svg>
    );
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const points = finite.map((v, i): [number, number] => {
    const x = finite.length === 1 ? width / 2 : PAD + (i / (finite.length - 1)) * innerW;
    // A constant series sits in the middle instead of hugging an edge.
    const y = span === 0 ? midY : PAD + innerH - ((v - min) / span) * innerH;
    return [x, y];
  });
  const first = points[0]!;
  const last = points[points.length - 1]!;

  if (points.length === 1) {
    return (
      <svg {...box}>
        <line x1={PAD} x2={width - PAD} y1={midY} y2={midY} stroke={color} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="4 4" />
        <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
      </svg>
    );
  }

  const coords = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  const base = height - PAD;
  const area = `M${first[0].toFixed(1)},${base} L${coords.join(" L")} L${last[0].toFixed(1)},${base} Z`;

  return (
    <svg {...box}>
      {filled && <path d={area} fill={color} fillOpacity={0.14} stroke="none" />}
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}
