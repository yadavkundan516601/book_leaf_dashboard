import type { ReactNode } from "react";
import { HelpTip } from "./HelpTip";
import { Sparkline } from "./Sparkline";
import { formatNumber, type Tone } from "./tone";

export interface KpiDelta {
  /** Change versus the previous period, in percent (12.5 means +12.5%). */
  value: number;
  /** Which direction is good news; decides green vs red (default "up"). */
  goodWhen?: "up" | "down";
}

export interface KpiCardProps {
  label: string;
  /** Headline value; null renders "—" (no data). */
  value: string | number | null;
  delta?: KpiDelta | null;
  /** Recent values, oldest first, drawn as a sparkline. */
  series?: readonly number[];
  /** Accent for the icon and sparkline (default primary). */
  tone?: Tone;
  footnote?: ReactNode;
  icon?: ReactNode;
  /** Explanation shown in a HelpTip next to the label. */
  help?: ReactNode;
}

function formatDelta(value: number): string {
  const abs = Math.abs(value);
  return `${abs.toLocaleString(undefined, { maximumFractionDigits: abs < 10 ? 1 : 0 })}%`;
}

/** Metric tile: label, big value, coloured delta pill and an optional sparkline. */
export function KpiCard({ label, value, delta, series, tone = "primary", footnote, icon, help }: KpiCardProps) {
  const noData = value === null || value === "";
  const display = noData ? "—" : typeof value === "number" ? formatNumber(value) : value;

  let deltaEl: ReactNode = null;
  let deltaText = "";
  if (delta && Number.isFinite(delta.value) && !noData) {
    const dir = delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat";
    const goodWhen = delta.goodWhen ?? "up";
    const deltaTone = dir === "flat" ? "neutral" : dir === goodWhen ? "success" : "danger";
    const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "";
    deltaText =
      dir === "flat"
        ? "No change versus the previous period."
        : `${dir === "up" ? "Up" : "Down"} ${formatDelta(delta.value)} versus the previous period, ${deltaTone === "success" ? "an improvement" : "a decline"}.`;
    deltaEl = (
      <span className={`ui-pill ui-pill--${deltaTone} ui-kpi__delta`}>
        {arrow && <span className="ui-kpi__arrow">{arrow}</span>}
        {formatDelta(delta.value)}
      </span>
    );
  }

  const summary = `${label}: ${noData ? "no data" : display}.${deltaText ? ` ${deltaText}` : ""}`;

  return (
    <div className="ui-card ui-kpi" role="group" aria-label={summary}>
      <div className="ui-kpi__head">
        {icon && (
          <span className={`ui-kpi__icon ui-kpi__icon--${tone}`} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="ui-kpi__label" aria-hidden="true">
          {label}
        </span>
        {help && <HelpTip label={`About ${label}`}>{help}</HelpTip>}
      </div>
      <div className="ui-kpi__body" aria-hidden="true">
        <div className="ui-kpi__figures">
          <span className={`ui-kpi__value${noData ? " ui-kpi__value--empty" : ""}`}>{display}</span>
          {deltaEl}
        </div>
        {series && series.length > 0 && <Sparkline values={series} tone={tone} width={96} height={40} filled />}
      </div>
      {footnote && <p className="ui-kpi__footnote">{footnote}</p>}
    </div>
  );
}
