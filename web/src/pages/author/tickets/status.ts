import type { AuthorTicketSummaryDto, TicketStatus } from "@bookleaf/shared";

/** Plain-language meaning of each status, used by the tab empty states and the conversation page. */
export const STATUS_MEANING: Record<TicketStatus, { short: string; long: string }> = {
  open: {
    short: "Received",
    long: "Open means we've received your query and it's waiting for our team to pick it up.",
  },
  in_progress: {
    short: "Being worked on",
    long: "In progress means someone on our team is working on your query right now.",
  },
  resolved: {
    short: "Answered",
    long: "Resolved means we've answered your query. You can still reply to reopen it if you need more help.",
  },
  closed: {
    short: "Finished",
    long: "Closed means the conversation is finished. For anything else, start a new query.",
  },
};

/** "What happens next" copy for the conversation page; deliberately free of response-time promises. */
export const NEXT_STEPS: Record<TicketStatus, { title: string; points: string[] }> = {
  open: {
    title: "We've got your query",
    points: [
      "Our support team will reply right here on this page.",
      "You'll see their reply appear live; there's no need to refresh.",
      "You can add more details below at any time.",
    ],
  },
  in_progress: {
    title: "Someone is looking into it",
    points: [
      "A member of our team is working on your query.",
      "Their reply will appear here as soon as it's sent.",
      "If something changes on your side, add it below so they have the full picture.",
    ],
  },
  resolved: {
    title: "We've answered your query",
    points: [
      "If the answer helped, there's nothing more you need to do.",
      "If you need more, reply below and the query reopens for our team.",
    ],
  },
  closed: {
    title: "This conversation is finished",
    points: [
      "Replies are turned off for closed queries.",
      "For anything else, start a new query and we'll pick it up from there.",
    ],
  },
};

/** True when the latest message is a team reply the author should read (drives the promoted card). */
export const hasNewReply = (t: Pick<AuthorTicketSummaryDto, "awaitingAuthor" | "status">) =>
  t.awaitingAuthor && (t.status === "open" || t.status === "in_progress");
