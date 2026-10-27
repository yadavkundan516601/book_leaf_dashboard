import {
  TICKET_STATUS_LABELS,
  type ClassificationSource,
  type TicketEventDto,
  type TicketStatus,
  type TriageSentiment,
} from "@bookleaf/shared";
import type { Tone } from "../../../components/ui";
import { labelForValue } from "../../../lib/format";

/** Sentiment pill tones: the angrier the author, the louder the colour. */
export const SENTIMENT_TONE: Record<TriageSentiment, Tone> = {
  calm: "neutral",
  concerned: "info",
  frustrated: "warning",
  angry: "danger",
};

export const SENTIMENT_HELP =
  "The author's tone as read by the classifier (AI, or keyword rules when the AI is unavailable): calm, concerned, frustrated or angry. It helps you pick your wording; it does not change the SLA.";

export const SOURCE_LABELS: Record<ClassificationSource, string> = { ai: "AI", rules: "Rules", admin: "Admin" };

/** Plain-language help for the AI / Rules / Admin source tags. */
export const SOURCE_HELP =
  "Where the value came from. AI: the AI classifier read the ticket. Rules: keyword rules were used because the AI was unavailable. Admin: a team member set it by hand, so a re-run will not overwrite it.";

/**
 * Readable label for an activity value, including the classifier's composite form:
 * "royalty_payments/high via ai" -> "Royalty & Payments · High (AI)", and a trailing
 * ", escalate" flag -> "... (AI) · Escalate".
 */
export function describeEventValue(value: string): string {
  const [main = value, via] = value.split(" via ");
  const [source, ...flags] = via ? via.split(", ") : [];
  const flagText = flags.includes("escalate") ? " · Escalate" : "";
  const label =
    main
      .split("/")
      .filter((p) => p && p !== "null")
      .map((p) => labelForValue(p))
      .join(" · ") || "Not set";
  if (!source) return label;
  return `${label} (${SOURCE_LABELS[source as ClassificationSource] ?? source})${flagText}`;
}

const EVENT_LABELS: Record<string, string> = {
  created: "opened the ticket",
  classified: "classified the ticket",
  status_changed: "changed the status",
  category_changed: "changed the category",
  priority_changed: "changed the priority",
  assigned: "assigned the ticket",
  unassigned: "unassigned the ticket",
};

/** One timeline entry: who did what, and the before/after values when there are any. */
export function describeEvent(ev: TicketEventDto): { actor: string; action: string; change: string | null } {
  const type = ev.type.split(".").pop() ?? ev.type;
  const actor = ev.actorName ?? (type === "classified" ? "AI classifier" : "System");
  const action = EVENT_LABELS[type] ?? type.replace(/[_-]+/g, " ");
  let change: string | null = null;
  if (type === "assigned" && ev.to) change = ev.from ? `${ev.from} → ${ev.to}` : `to ${ev.to}`;
  else if (type === "unassigned" && ev.from) change = `was ${ev.from}`;
  else if (ev.from && ev.to) change = `${describeEventValue(ev.from)} → ${describeEventValue(ev.to)}`;
  else if (ev.to) change = describeEventValue(ev.to);
  return { actor, action, change };
}

export const statusLabel = (s: TicketStatus) => TICKET_STATUS_LABELS[s];

/** "⌘" on Apple platforms, "Ctrl" elsewhere, for the send shortcut hint. */
export const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";
