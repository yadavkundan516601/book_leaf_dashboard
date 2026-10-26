/** Dashboard-only number and date helpers. Every figure on the page goes through Intl with the en-IN locale. */

const LOCALE = "en-IN";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });

export const formatInt = (n: number) => integer.format(n);

/** Share in 0..1 as a whole percentage ("72%"); null renders "—". */
export const formatRate = (ratio: number | null) => (ratio === null ? "—" : percent.format(ratio));

/** "$0.00" */
export const formatCost = (usdAmount: number) => usd.format(usdAmount);

/** Duration in hours: "3.2 h" under a day, "1d 4h" from a day up; null renders "—". */
export function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  if (hours < 24) return `${oneDecimal.format(Math.max(0, hours))} h`;
  const whole = Math.round(hours);
  const days = Math.floor(whole / 24);
  const rest = whole % 24;
  return rest ? `${integer.format(days)}d ${rest}h` : `${integer.format(days)}d`;
}

/** Whole-percent change versus the previous period; null when there is no previous figure to compare with. */
export function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Short UTC weekday names for `count` daily buckets ending on the day of `endIso`, oldest first. */
export function weekdayLabels(endIso: string, count: number): string[] {
  const end = new Date(endIso).getTime();
  return Array.from({ length: count }, (_, i) => weekday.format(new Date(end - (count - 1 - i) * 86_400_000)));
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
