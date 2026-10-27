/**
 * Deterministic quality check for reply drafts, shared by the server (to
 * annotate drafts) and the web composer (to re-check live as the admin
 * edits). Pure TypeScript, no Node or DOM APIs.
 *
 * Grounding check: every money amount, date, duration and percentage in the
 * reply must be backed by the author's data or the knowledge base; anything
 * else is reported with its character range so the UI can select it.
 * Checklist: the house style for a good reply (greeting, empathy, a specific
 * fact, a next step with a timeline, the sign-off, length).
 *
 * All patterns are linear (no nested quantifiers over the same characters),
 * so a 5,000-character reply checks in well under a millisecond or two.
 */

/** Facts a reply may quote. Built by the server from the ticket context and returned with every draft. */
export interface DraftGrounding {
  firstName: string | null;
  /** Money amounts in INR the reply may quote (book figures, totals, thresholds, ticket-stated amounts). */
  amounts: number[];
  /** ISO yyyy-mm-dd dates the reply may quote. */
  dates: string[];
  /** Other allowed numbers: copies sold, counts, ticket-stated figures. */
  numbers: number[];
  /** Allowed phrases such as policy durations ("45 days", "24–48 hours", "5–7 business days"). */
  allowedPhrases: string[];
}

export const DRAFT_WARNING_KINDS = ["amount", "date", "duration", "percent", "format"] as const;
export type DraftWarningKind = (typeof DRAFT_WARNING_KINDS)[number];
export type DraftWarningSeverity = "high" | "medium" | "low";

export interface DraftWarning {
  kind: DraftWarningKind;
  severity: DraftWarningSeverity;
  /** The offending snippet, exactly as it appears in the body. */
  text: string;
  message: string;
  /** Character offsets into the body: body.slice(start, end) === text. */
  start: number;
  end: number;
}

export const DRAFT_CHECKLIST_IDS = ["greeting", "empathy", "fact", "next_step", "sign_off", "length"] as const;
export type DraftChecklistId = (typeof DRAFT_CHECKLIST_IDS)[number];

export interface DraftChecklistItem {
  id: DraftChecklistId;
  label: string;
  passed: boolean;
  hint: string;
}

export interface DraftCheckResult {
  warnings: DraftWarning[];
  checklist: DraftChecklistItem[];
}

export const DRAFT_SIGN_OFF = "Warm regards,\nBookLeaf Author Support";
export const DRAFT_MAX_WORDS = 220;

/** Timelines BookLeaf policy commits to (knowledge base). */
export const POLICY_DURATIONS: readonly string[] = [
  "45 days",
  "48 hours",
  "24–48 hours",
  "5–7 business days",
  "7–10 business days",
  "3–5 business days",
];

export const EMPTY_DRAFT_GROUNDING: DraftGrounding = { firstName: null, amounts: [], dates: [], numbers: [], allowedPhrases: [] };

/** Percentages that are part of BookLeaf's royalty split. */
const ALLOWED_PERCENTS = [80, 20];
const MAX_FORMAT_WARNINGS = 10;

// ---------------------------------------------------------------------------
// Number and phrase parsing
// ---------------------------------------------------------------------------

const MULTIPLIERS: Record<string, number> = { k: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, crore: 10_000_000, crores: 10_000_000, cr: 10_000_000 };

function parseNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Currency before the number (₹3,570 / Rs. 3570 / INR 1,20,000 / ₹3.5k) or after it (3570 rupees / 3,570/-). */
const AMOUNT_RE =
  /(?:₹|\b(?:rs|inr)(?!\p{L})\.?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|lakhs?|lacs?|crores?|cr)\b)?|(?<![\d,.])\b(\d[\d,]*(?:\.\d+)?)\s?(?:rupees\b|inr\b|\/-)/giu;

interface Span {
  start: number;
  end: number;
  text: string;
}

interface AmountMatch extends Span {
  value: number;
}

/** Money amounts in the text, with their INR value. Trailing grouping commas ("₹3,570,") are left out of the span. */
export function extractAmounts(text: string): AmountMatch[] {
  const out: AmountMatch[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    let raw = m[1] ?? m[3] ?? "";
    let full = m[0];
    // "₹3,570, and" -> drop the sentence comma the digit class swallowed (only when it ends the number).
    if (m[1] !== undefined && m[2] === undefined) {
      const trimmed = raw.replace(/,+$/, "");
      full = full.slice(0, full.length - (raw.length - trimmed.length));
      raw = trimmed;
    }
    const mult = m[2] ? (MULTIPLIERS[m[2].toLowerCase()] ?? 1) : 1;
    const value = parseNumber(raw) * mult;
    if (!Number.isFinite(value)) continue;
    out.push({ start: m.index, end: m.index + full.length, text: full, value });
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b\\.?";
const ORD = "(?:st|nd|rd|th)?";

const DATE_ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DATE_DMY_RE = new RegExp(`\\b(\\d{1,2})${ORD}\\s(?:of\\s)?${MONTH},?(?:\\s(\\d{4})\\b)?`, "gi");
const DATE_MDY_RE = new RegExp(`\\b${MONTH}\\s(\\d{1,2})${ORD}\\b(?:,?\\s(\\d{4})\\b)?`, "gi");
const DATE_NUM_RE = /\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})\b/g;

interface DateMatch extends Span {
  /** Candidate readings as { y?, m, d }; numeric dates can be read day-first or month-first. */
  readings: { y: number | null; m: number; d: number }[];
}

const monthIndex = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
const validDay = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** Calendar dates in the text: ISO, "14 Nov 2026", "Nov 14", "November 14, 2026", "14/11/2026". */
export function extractDates(text: string): DateMatch[] {
  const out: DateMatch[] = [];
  // Characters already claimed by an earlier pattern: O(span) per check, not O(matches).
  const covered = new Uint8Array(text.length);
  const taken = (start: number, end: number) => covered.subarray(start, end).includes(1);
  const push = (start: number, matched: string, readings: DateMatch["readings"]) => {
    const end = start + matched.length;
    const valid = readings.filter((r) => validDay(r.m, r.d));
    if (!valid.length || taken(start, end)) return;
    covered.fill(1, start, end);
    out.push({ start, end, text: matched, readings: valid });
  };
  for (const m of text.matchAll(DATE_ISO_RE)) push(m.index, m[0], [{ y: +m[1]!, m: +m[2]!, d: +m[3]! }]);
  for (const m of text.matchAll(DATE_DMY_RE)) {
    const monthWord = m[2]!;
    if (monthWord === "may") continue; // lower-case "may" is the verb
    const matched = m[0].replace(/[.,]$/, "");
    push(m.index, matched, [{ y: m[3] ? +m[3] : null, m: monthIndex(monthWord), d: +m[1]! }]);
  }
  for (const m of text.matchAll(DATE_MDY_RE)) {
    const monthWord = m[1]!;
    if (monthWord === "may") continue;
    push(m.index, m[0], [{ y: m[3] ? +m[3] : null, m: monthIndex(monthWord), d: +m[2]! }]);
  }
  for (const m of text.matchAll(DATE_NUM_RE)) {
    const a = +m[1]!;
    const b = +m[3]!;
    const y = m[4]!.length === 2 ? 2000 + +m[4]! : +m[4]!;
    push(m.index, m[0], [
      { y, m: b, d: a },
      { y, m: a, d: b },
    ]);
  }
  return out.sort((x, y) => x.start - y.start);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, thirty: 30,
};
const QTY = `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
const UNIT = "(business\\s+days?|working\\s+days?|days?|hours?|hrs?|weeks?|months?)";
const DURATION_RE = new RegExp(`\\b${QTY}(?:\\s?(?:–|—|-|to)\\s?${QTY})?[\\s-]${UNIT}\\b`, "gi");

const qtyValue = (s: string) => (/^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s.toLowerCase()] ?? NaN));

function normalizeUnit(unit: string, plural: boolean): string {
  const u = unit.toLowerCase().replace(/\s+/g, " ");
  const base = u.startsWith("business") || u.startsWith("working") ? "business day" : u.startsWith("h") ? "hour" : u.replace(/s$/, "");
  return plural ? `${base}s` : base;
}

interface DurationMatch extends Span {
  /** Canonical form: "24–48 hours", "5–7 business days", "1 week". */
  key: string;
}

/** Durations such as "48 hours", "within 24-48 hours", "5–7 business days", "three weeks". */
export function extractDurations(text: string): DurationMatch[] {
  const out: DurationMatch[] = [];
  for (const m of text.matchAll(DURATION_RE)) {
    const from = qtyValue(m[1]!);
    const to = m[2] ? qtyValue(m[2]) : null;
    if (!Number.isFinite(from) || (to !== null && !Number.isFinite(to))) continue;
    // "a day" / "an hour" are idioms ("twice a day"), not commitments; only count them after "within".
    if (/^an?$/i.test(m[1]!) && !/within\s$/i.test(text.slice(Math.max(0, m.index - 7), m.index))) continue;
    const top = to ?? from;
    const key = `${to === null ? from : `${from}–${to}`} ${normalizeUnit(m[3]!, top !== 1)}`;
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], key });
  }
  return out;
}

/** Canonical key for an allowed phrase, so "24-48 hours", "24 to 48 hrs" and "24–48 hours" compare equal. */
export function durationKey(phrase: string): string | null {
  const m = extractDurations(phrase)[0];
  return m ? m.key : null;
}

const PERCENT_RE = /\b(\d{1,3}(?:\.\d+)?)\s?(%|percent\b|per\scent\b)/gi;

// ---------------------------------------------------------------------------
// Checklist helpers
// ---------------------------------------------------------------------------

const GREETING_RE = /^(?:hi|hello|dear|hey|namaste|namaskar)\b[\s,]*(\p{L}[\p{L}\p{M}'-]*)?/iu;
const EMPATHY_RE = /\b(?:sorry|apologi[sz]e|understand|thank you for|thanks for|appreciate|frustrat)/i;
const NEXT_STEP_RE =
  /\b(?:we will|we'll|we are (?:escalating|asking|checking|triggering|arranging)|our (?:team|production team|accounts team|distribution team) will|i will|i'll|please (?:reply|share|send|confirm|check|let|could)|could you|can you|you can|just reply|reply here|next step)/i;
const TIMELINE_WORD_RE = /\bwithin\s+(?:\d+|a|an|one|two|three|the next)\b|\bbusiness days\b|\bworking days\b/i;
const BY_RE = /\bby\s+/gi;
const STATUS_RE =
  /\b(?:published & live|published and live|manuscript received|editing|cover design|typesetting|proofreading|isbn assignment|distribution setup|printing stage)\b/i;
const QUOTED_TITLE_RE = /["“][^"”\n]{2,120}["”]/;
const BARE_NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?\b/g;

const WORD_RE = /\S+/g;

function words(body: string): { count: number; overflowStart: number | null } {
  let count = 0;
  let overflowStart: number | null = null;
  for (const m of body.matchAll(WORD_RE)) {
    count++;
    if (count === DRAFT_MAX_WORDS + 1) overflowStart = m.index;
  }
  return { count, overflowStart };
}

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");

function endsWithSignOff(body: string): boolean {
  const lines = normalizeNewlines(body)
    .trimEnd()
    .split("\n")
    .map((l) => l.trim());
  return lines.slice(-2).join("\n") === DRAFT_SIGN_OFF;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const isoOf = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function checkDraft(body: string, grounding: DraftGrounding): DraftCheckResult {
  const warnings: DraftWarning[] = [];
  const add = (w: DraftWarning) => warnings.push(w);

  // Amounts
  const amounts = extractAmounts(body);
  const groundedAmount = amounts.some((a) => grounding.amounts.some((g) => near(g, a.value)));
  for (const a of amounts) {
    if (grounding.amounts.some((g) => near(g, a.value))) continue;
    add({ kind: "amount", severity: "high", text: a.text, message: `${a.text} isn't in this author's data`, start: a.start, end: a.end });
  }

  // Dates
  const allowedDates = new Set(grounding.dates);
  const allowedMonthDays = new Set(grounding.dates.map((d) => d.slice(5)));
  const dates = extractDates(body);
  let groundedDate = false;
  for (const d of dates) {
    const ok = d.readings.some((r) => (r.y === null ? allowedMonthDays.has(isoOf(2000, r.m, r.d).slice(5)) : allowedDates.has(isoOf(r.y, r.m, r.d))));
    if (ok) {
      groundedDate = true;
      continue;
    }
    add({ kind: "date", severity: "medium", text: d.text, message: `${d.text} doesn't match any date in this author's data`, start: d.start, end: d.end });
  }

  // Durations
  const allowedDurations = new Set<string>();
  for (const p of grounding.allowedPhrases) {
    const key = durationKey(p);
    if (key) allowedDurations.add(key);
  }
  const durations = extractDurations(body);
  for (const d of durations) {
    if (allowedDurations.has(d.key)) continue;
    add({
      kind: "duration",
      severity: "medium",
      text: d.text,
      message: `"${d.text}" isn't a timeline from the knowledge base or this ticket`,
      start: d.start,
      end: d.end,
    });
  }

  // Percentages
  const allowedPercentPhrases = new Set(grounding.allowedPhrases.map((p) => p.replace(/\s+/g, "").toLowerCase()));
  for (const m of body.matchAll(PERCENT_RE)) {
    const value = Number(m[1]);
    if (ALLOWED_PERCENTS.includes(value) || allowedPercentPhrases.has(`${m[1]}%`)) continue;
    add({
      kind: "percent",
      severity: "medium",
      text: m[0],
      message: `${m[0]} isn't part of BookLeaf's 80/20 royalty split`,
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // Format: markdown artefacts and length
  let formatCount = 0;
  const formatWarning = (start: number, end: number, message: string) => {
    if (formatCount++ >= MAX_FORMAT_WARNINGS) return;
    add({ kind: "format", severity: "low", text: body.slice(start, end), message, start, end });
  };
  for (const m of body.matchAll(/\*\*|__/g)) formatWarning(m.index, m.index + 2, `Markdown "${m[0]}" shows up literally in the author's email`);
  for (const m of body.matchAll(/^[ \t]*(#{1,6}[ \t]|[•●▪◦*–-][ \t])/gm)) {
    const start = m.index + m[0].length - m[1]!.length;
    const symbol = m[1]!.trim();
    formatWarning(start, start + symbol.length, symbol.startsWith("#") ? "Markdown heading: use a plain sentence instead" : "Bullet symbol: use plain sentences or numbered steps");
  }
  const { count, overflowStart } = words(body);
  if (overflowStart !== null) {
    const end = body.trimEnd().length;
    add({
      kind: "format",
      severity: "low",
      text: body.slice(overflowStart, end),
      message: `The reply is ${count} words; keep it within ${DRAFT_MAX_WORDS}`,
      start: overflowStart,
      end,
    });
  }

  warnings.sort((a, b) => a.start - b.start);

  // Checklist
  const firstLine = body.trimStart().split("\n", 1)[0] ?? "";
  const greet = GREETING_RE.exec(firstLine);
  const greetedName = greet?.[1] ?? "";
  const greetingOk = grounding.firstName
    ? greetedName.toLowerCase() === grounding.firstName.toLowerCase()
    : greetedName !== "" && !/^(there|author|sir|madam|team)$/i.test(greetedName);

  const groundedNumbers = [...grounding.amounts, ...grounding.numbers];
  let groundedBare = false;
  for (const m of body.matchAll(BARE_NUMBER_RE)) {
    const v = parseNumber(m[0]);
    if (v >= 10 && groundedNumbers.some((g) => near(g, v))) {
      groundedBare = true;
      break;
    }
  }
  const hasFact = groundedAmount || groundedDate || groundedBare || STATUS_RE.test(body) || QUOTED_TITLE_RE.test(body);

  const hasTimeline =
    TIMELINE_WORD_RE.test(body) ||
    durations.length > 0 ||
    [...body.matchAll(BY_RE)].some((m) => dates.some((d) => d.start === m.index + m[0].length));
  const nextStepOk = NEXT_STEP_RE.test(body) && hasTimeline;

  const checklist: DraftChecklistItem[] = [
    {
      id: "greeting",
      label: "Greets by first name",
      passed: greetingOk,
      hint: grounding.firstName ? `Open with “Hi ${grounding.firstName},”.` : "Open with “Hi” and the author's first name.",
    },
    {
      id: "empathy",
      label: "Acknowledges the concern",
      passed: EMPATHY_RE.test(body),
      hint: "Acknowledge the author's concern first, e.g. “Thank you for flagging this” or “I'm sorry for the worry this has caused”.",
    },
    {
      id: "fact",
      label: "Quotes a specific fact",
      passed: hasFact,
      hint: "Include a real figure from the author's data: an amount, a date, the book's status or its title.",
    },
    {
      id: "next_step",
      label: "Next step with a timeline",
      passed: nextStepOk,
      hint: "Say what happens next and when, e.g. “we will get back to you within 48 hours”.",
    },
    {
      id: "sign_off",
      label: "Signed off",
      passed: endsWithSignOff(body),
      hint: "End with “Warm regards,” and “BookLeaf Author Support” on the next line.",
    },
    {
      id: "length",
      label: `Within ${DRAFT_MAX_WORDS} words`,
      passed: count <= DRAFT_MAX_WORDS,
      hint: `The reply is ${count} words. Trim it to ${DRAFT_MAX_WORDS} or fewer.`,
    },
  ];

  return { warnings, checklist };
}
