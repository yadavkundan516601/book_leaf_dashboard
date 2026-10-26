/** Shared tone names and token-backed colours for the UI kit (fallbacks render before tokens.css lands). */
export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const toneColor: Record<Tone, string> = {
  neutral: "var(--muted, #566f9e)",
  primary: "var(--primary, #f26979)",
  success: "var(--success, #04a08b)",
  warning: "var(--warning, #f6b749)",
  danger: "var(--danger, #ff6c6c)",
  info: "var(--blue, #3762ea)",
};

/** Default categorical palette for charts, in series order. */
export const chartPalette: readonly string[] = [
  toneColor.primary,
  toneColor.info,
  "var(--cyan, #00baff)",
  toneColor.success,
  toneColor.warning,
  toneColor.danger,
];

/** Formats a number for display with locale grouping. */
export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Formats a share of a total as a whole percentage, showing "<1%" for small non-zero shares. */
export function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0%";
  const pct = (part / total) * 100;
  if (part > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
