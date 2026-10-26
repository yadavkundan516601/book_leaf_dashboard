import type { RoyaltySummaryDto } from "@bookleaf/shared";
import { formatDate, formatINR } from "../../../lib/format";
import { isBelowThreshold } from "./royalty";

export interface NextAction {
  kind: "replies" | "rollover" | "first-payout" | "all-clear";
  tone: "primary" | "warning" | "info" | "success";
  title: string;
  body: string;
  link?: { to: string; label: string };
}

/** The single most useful thing to tell the author right now; the first rule that applies wins. */
export function nextAction(royalty: RoyaltySummaryDto, newReplies: number): NextAction {
  if (newReplies > 0) {
    return {
      kind: "replies",
      tone: "primary",
      title: newReplies === 1 ? "You have 1 new reply" : `You have ${newReplies} new replies`,
      body: "Our team has answered your question. Open it to read the reply and respond if you need to.",
      link: { to: "/author/tickets", label: newReplies === 1 ? "Read the reply" : "Read the replies" },
    };
  }

  const threshold = formatINR(royalty.payoutThreshold);
  if (isBelowThreshold(royalty)) {
    return {
      kind: "rollover",
      tone: "warning",
      title: `Your ${formatINR(royalty.totalPending)} rolls over to next quarter`,
      body: `Payouts start at ${threshold}. Smaller balances are not lost: they are carried forward and paid once your total reaches ${threshold}.`,
      link: { to: "/author/books", label: "See royalty by book" },
    };
  }

  if (royalty.totalPaid === 0 && royalty.totalEarned > 0) {
    return {
      kind: "first-payout",
      tone: "info",
      title: `Your first payout is due by ${formatDate(royalty.nextPayoutDueBy)}`,
      body: "Royalties are calculated every quarter and paid within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard.",
      link: { to: "/author/help", label: "How payouts work" },
    };
  }

  return {
    kind: "all-clear",
    tone: "success",
    title: "You're all caught up",
    body: "No new replies and nothing needs your attention right now.",
  };
}
