/** Calendar helpers. All dates are handled as UTC calendar days (YYYY-MM-DD). */

export const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

/** "2026-11-14" -> "14 Nov 2026" (for author-facing text). */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Last day of the quarter containing `d`. */
export function quarterEnd(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3);
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0));
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export const ROYALTY_PAYOUT_WINDOW_DAYS = 45;
export const ROYALTY_PAYOUT_THRESHOLD_INR = 1000;

/**
 * Royalty policy: calculated quarterly, paid within 45 days of quarter end.
 * Returns the end of the quarter that most recently closed and its payout
 * deadline, plus the currently accruing quarter's end and its deadline.
 */
export function royaltyCycle(today: Date) {
  const currentQuarterEnd = quarterEnd(today);
  const previousQuarterEnd = new Date(
    Date.UTC(currentQuarterEnd.getUTCFullYear(), currentQuarterEnd.getUTCMonth() - 2, 0),
  );
  const previousPayoutDueBy = addDays(previousQuarterEnd, ROYALTY_PAYOUT_WINDOW_DAYS);
  // If the previous quarter's payout window is still open, that's the next payout.
  // Compare calendar days: on the due date itself the previous payout is still the next one.
  const nextPayoutDueBy =
    toIsoDate(today) <= toIsoDate(previousPayoutDueBy)
      ? previousPayoutDueBy
      : addDays(currentQuarterEnd, ROYALTY_PAYOUT_WINDOW_DAYS);
  return {
    currentQuarterEnd: toIsoDate(currentQuarterEnd),
    previousQuarterEnd: toIsoDate(previousQuarterEnd),
    nextPayoutDueBy: toIsoDate(nextPayoutDueBy),
  };
}
