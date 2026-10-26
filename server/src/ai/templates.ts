/**
 * Policy-based reply templates, used when the AI cannot draft (not configured,
 * disabled, circuit open, failed or unusable output). Each one follows the
 * KB policy for its category and is filled with the ticket's real facts
 * (first name, book title and status, royalty figures, payout date), in the
 * same voice and sign-off as the AI drafts, so the admin edits rather than
 * rewrites. Plain text, like the AI output.
 */
import type { TicketCategory } from "@bookleaf/shared";
import { ROYALTY_PAYOUT_THRESHOLD_INR, ROYALTY_PAYOUT_WINDOW_DAYS, formatLongDate } from "../lib/dates.js";
import { daysBetween, firstName, inr, isPublished, type BookRow, type TicketContext } from "./ticket-context.js";

export const SIGN_OFF = "Warm regards,\nBookLeaf Author Support";

/** Production stages in order, as described in the KB. */
const PRODUCTION_STAGES = [
  "Manuscript Received",
  "Editing",
  "Cover Design",
  "Typesetting",
  "Proofreading",
  "ISBN Assignment",
  "Printing",
  "Distribution Setup",
  "Published & Live",
] as const;

/** A full quarter plus the 45-day payout window: longer than this without a payout means one was missed. */
const OVERDUE_AFTER_DAYS = 92 + ROYALTY_PAYOUT_WINDOW_DAYS;

/** "In Production - Cover Design" -> "Cover Design". */
export function productionStage(status: string): string {
  const m = /^in production\s*[-–—:]\s*(.+)$/i.exec(status.trim());
  return (m?.[1] ?? status).trim();
}

function remainingStages(stage: string): string[] {
  const i = PRODUCTION_STAGES.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  return i < 0 ? [] : PRODUCTION_STAGES.slice(i + 1, -1);
}

const quoted = (b: BookRow) => `"${b.title}"`;
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function notYetPublished(b: BookRow): string {
  return `${quoted(b)} is currently at the ${productionStage(b.status)} stage of production, so it is not on sale yet.`;
}

function royalty(ctx: TicketContext): string[] {
  const { book: b, royalty: r } = ctx;
  const paras: string[] = [];
  let overdue = false;

  if (b && isPublished(b)) {
    const last = b.lastRoyaltyPayoutDate;
    overdue = b.royaltyPending > 0 && (!last || daysBetween(last, ctx.today) > OVERDUE_AFTER_DAYS);
    paras.push(
      `Thank you for writing in about the royalties for ${quoted(b)}, and I'm sorry for the worry this has caused. I've checked your account: ${quoted(b)} has ${b.totalCopiesSold} copies sold and ${inr(b.royaltyPending)} in royalties pending, and ${last ? `the last payout on this book was made on ${formatLongDate(last)}` : "no payout has been made on this book yet"}.`,
    );
  } else if (b) {
    paras.push(
      `Thank you for writing in about your royalties. ${notYetPublished(b)} Royalties start accruing once it is live and selling, so there is nothing pending on this title yet.`,
    );
  } else {
    paras.push("Thank you for writing in about your royalties, and I'm sorry for any worry this has caused.");
  }

  paras.push(
    `BookLeaf calculates royalties quarterly and pays them within ${ROYALTY_PAYOUT_WINDOW_DAYS} days of each quarter closing, so your next payout is due by ${formatLongDate(r.nextPayoutDueBy)}.`,
  );

  paras.push(
    r.meetsThreshold
      ? `Across all your books you currently have ${inr(r.totalPending)} pending, which is above the ${inr(ROYALTY_PAYOUT_THRESHOLD_INR)} minimum payout, so it is due to be paid out.`
      : `Across all your books you currently have ${inr(r.totalPending)} pending. As this is below our ${inr(ROYALTY_PAYOUT_THRESHOLD_INR)} minimum payout, it rolls over to the next quarter and is paid out as soon as the total crosses ${inr(ROYALTY_PAYOUT_THRESHOLD_INR)}.`,
  );

  paras.push(
    "Payouts are made by bank transfer to the account linked in your author dashboard, so please could you confirm that your bank details are linked and up to date there? You can also see a platform-wise breakdown of your sales in the dashboard, and we're happy to share a line-by-line royalty statement if that would help.",
  );

  paras.push(
    overdue && r.meetsThreshold
      ? "A payout on this book looks overdue, and that is on us. We are escalating it to our accounts team now and will get back to you with a resolution within 48 hours."
      : `If you have not received your payout by ${formatLongDate(r.nextPayoutDueBy)}, just reply here and we will escalate it straight away, with a resolution within 48 hours.`,
  );
  return paras;
}

function isbn(ctx: TicketContext): string[] {
  const b = ctx.book;
  const subject = b ? `the ISBN for ${quoted(b)}` : "your book's ISBN";
  const onRecord = b?.isbn ? ` The ISBN on our records for this title is ${b.isbn}.` : "";
  return [
    `Thank you for flagging this. A problem with ${subject} is a serious data issue, and we treat it as high priority.${onRecord}`,
    "We are escalating it to our production team, who will check the ISBN and listing details on every platform against our records and correct anything that does not match. We will get back to you with an update within 48 hours.",
    "If you can, please reply with a screenshot of the listing and a photo of the ISBN on your printed copy. It will help the team resolve this faster.",
  ];
}

function printing(ctx: TicketContext): string[] {
  const b = ctx.book;
  const copies = b ? `your copies of ${quoted(b)}` : "your copies";
  const partner = b?.printPartner ? ` We will also take this up with ${b.printPartner}, who handled this print run.` : "";
  return [
    `I'm truly sorry that ${copies} did not arrive in the condition you should expect from us.`,
    "Could you reply with clear photos of the affected copies, showing the problem pages, cover or binding? Once our team has verified the issue, BookLeaf will arrange a free reprint, which takes 5–7 business days from confirmation." +
      partner,
  ];
}

function distribution(ctx: TicketContext): string[] {
  const b = ctx.book;
  if (b && !isPublished(b)) {
    return [
      `Thank you for checking on where you can buy your book. ${notYetPublished(b)} Once it is published, listings on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store typically go live within 7–10 business days.`,
      "We will email you as it moves through each stage, and our team will share an updated timeline within 48 hours.",
    ];
  }
  const title = b ? quoted(b) : "your book";
  const listed = b?.availableOn.length ? ` On our side, ${title} is set up for ${listJoin(b.availableOn)}.` : "";
  return [
    `Thank you for letting us know, and I'm sorry ${title} is not showing as available.${listed}`,
    "This is usually a stock sync issue between our warehouse and the platform. We are asking our distribution team to trigger a re-sync, and the listing should be live and purchasable again within 24–48 hours. We will confirm here once it is back, and if it is not, we will escalate it straight away.",
  ];
}

function production(ctx: TicketContext): string[] {
  const b = ctx.book;
  if (!b) {
    return [
      "Thank you for checking in on your book's progress.",
      "Could you reply with the title of the book you are asking about? Our production team will then confirm its current stage and share an updated timeline within 48 hours.",
    ];
  }
  if (isPublished(b)) {
    const since = b.publicationDate ? ` since ${formatLongDate(b.publicationDate)}` : "";
    const where = b.availableOn.length ? `, and it is listed on ${listJoin(b.availableOn)}` : "";
    return [
      `Thank you for checking in. Good news: ${quoted(b)} has been Published & Live${since}${where}.`,
      "If something about the listing does not look right, just reply here and we will look into it within 48 hours.",
    ];
  }
  const stage = productionStage(b.status);
  const next = remainingStages(stage);
  const ahead = next.length ? ` After this, it moves through ${listJoin(next)} before it is published and live.` : "";
  const commonDelay = /cover/i.test(stage)
    ? " Cover design is often where timelines stretch, usually while we wait on a final cover approval, so if anything is needed from you we will flag it clearly and turn it around quickly together."
    : /proof/i.test(stage)
      ? " Proofreading can take a little longer when there are revision rounds, and we will work through them with you as quickly as possible."
      : "";
  return [
    `Thank you for checking in on ${quoted(b)}, and I understand how eager you are to see it published. It is currently at the ${stage} stage.${ahead}`,
    `We are checking with our production team on where it stands.${commonDelay} We will come back to you with a specific updated timeline within 48 hours.`,
  ];
}

function general(ctx: TicketContext): string[] {
  const b = ctx.book;
  const which = b ? ` for ${quoted(b)}` : "";
  return [
    "Thank you for getting in touch.",
    `Updates to your book description or author bio${which} can be submitted through your dashboard, or simply by replying here or emailing the BookLeaf team with the new text. Once submitted, changes typically reflect across Amazon, Flipkart and the BookLeaf Store within 3–5 business days.`,
    "If your question is about something else, our team will look into it and get back to you within 48 hours.",
  ];
}

const BUILDERS: Record<TicketCategory, (ctx: TicketContext) => string[]> = {
  royalty_payments: royalty,
  isbn_metadata: isbn,
  printing_quality: printing,
  distribution_availability: distribution,
  book_status_production: production,
  general_inquiry: general,
};

export function templateDraft(category: TicketCategory, ctx: TicketContext): string {
  return [`Hi ${firstName(ctx.author.name)},`, ...BUILDERS[category](ctx), SIGN_OFF].join("\n\n");
}
