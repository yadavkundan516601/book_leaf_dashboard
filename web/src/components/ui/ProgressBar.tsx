import { useId } from "react";
import { toneColor, type Tone } from "./tone";

export interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: Tone;
  /** Visible label above the bar; also its accessible name. */
  label: string;
  /** Text after the label, e.g. "₹3,200 of ₹5,000" (default: percentage). */
  valueText?: string;
  /** Hide the visible label row (it stays the accessible name). */
  hideLabel?: boolean;
}

/** Determinate progress bar (role=progressbar) with a visible label and value. */
export function ProgressBar({ value, max = 100, tone = "primary", label, valueText, hideLabel = false }: ProgressBarProps) {
  const labelId = useId();
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), safeMax);
  const pct = Math.round((clamped / safeMax) * 100);
  const text = valueText ?? `${pct}%`;

  return (
    <div className="ui-progress">
      <div className={hideLabel ? "ui-sr-only" : "ui-progress__head"}>
        <span id={labelId} className="ui-progress__label">
          {label}
        </span>
        <span className="ui-progress__value" aria-hidden="true">
          {text}
        </span>
      </div>
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={text}
      >
        <span className="ui-progress__fill" style={{ width: `${pct}%`, background: toneColor[tone] }} />
      </div>
    </div>
  );
}
