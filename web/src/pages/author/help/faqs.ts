/** Help & FAQ content. Every answer restates BookLeaf policy only; keep each one under 60 words. */

export type FaqTopic = "royalties" | "isbn" | "printing" | "distribution" | "production" | "general";

export interface Faq {
  id: string;
  topic: FaqTopic;
  question: string;
  answer: string;
  /** Optional in-app link shown under the answer. */
  link?: { to: string; label: string };
}

const ASK = "/author/tickets/new";
const BOOKS = "/author/books";

export const FAQS: readonly Faq[] = [
  {
    id: "royalty-split",
    topic: "royalties",
    question: "How is my royalty worked out?",
    answer:
      "You get 80% of the net profit on every copy sold and BookLeaf keeps 20%. Net profit is the book's MRP minus the printing cost, the platform's commission and shipping.",
    link: { to: BOOKS, label: "See your royalties" },
  },
  {
    id: "royalty-schedule",
    topic: "royalties",
    question: "When are royalties paid?",
    answer:
      "Royalties are calculated every quarter and paid within 45 days of the quarter ending. The money is sent by bank transfer to the bank account linked in your dashboard.",
    link: { to: BOOKS, label: "See your next payout date" },
  },
  {
    id: "royalty-minimum",
    topic: "royalties",
    question: "Why didn't I get a payout this quarter?",
    answer:
      "The minimum payout is ₹1,000. If your balance is smaller than that, it rolls over to the next quarter and is paid once it reaches ₹1,000.",
    link: { to: BOOKS, label: "Check your pending balance" },
  },
  {
    id: "royalty-breakdown",
    topic: "royalties",
    question: "Where can I see my sales on each platform?",
    answer: "Your dashboard has a detailed royalty breakdown, including your sales on each platform.",
    link: { to: BOOKS, label: "See your books and royalties" },
  },
  {
    id: "isbn-own",
    topic: "isbn",
    question: "Does my book get an ISBN?",
    answer:
      "Yes. Every book gets its own unique ISBN under BookLeaf's imprint. If you want your book published under your own imprint, you need to get that ISBN yourself.",
  },
  {
    id: "isbn-error",
    topic: "isbn",
    question: "There's a mistake in my book's ISBN. What should I do?",
    answer:
      "Tell us as soon as you spot it. ISBN errors are treated as high priority and escalated straight to our production team.",
    link: { to: ASK, label: "Report an ISBN problem" },
  },
  {
    id: "metadata-update",
    topic: "isbn",
    question: "How do I change my book description or author bio?",
    answer:
      "Update it from your dashboard or email the BookLeaf team with the new text. Changes appear on the selling platforms within 3–5 business days.",
    link: { to: ASK, label: "Send us the change" },
  },
  {
    id: "print-who",
    topic: "printing",
    question: "Who prints my book, and how long does it take?",
    answer:
      "We print in-house in Delhi and also work with Repro India and Epitome Books. A standard print run takes 5–7 business days.",
  },
  {
    id: "print-defect",
    topic: "printing",
    question: "My copies arrived with a printing defect.",
    answer:
      "We reprint defective copies free of charge once the defect is verified. We may ask you for photos of the problem, so it helps to attach them when you contact us.",
    link: { to: ASK, label: "Report a print defect" },
  },
  {
    id: "dist-where",
    topic: "distribution",
    question: "Where will my book be sold?",
    answer: "Your book is listed on Amazon India, Flipkart, Amazon US, Amazon UK and the BookLeaf Store.",
    link: { to: BOOKS, label: "See where each book is listed" },
  },
  {
    id: "dist-when",
    topic: "distribution",
    question: "How long until my book appears on these stores?",
    answer: "New listings go live 7–10 business days after your book is published.",
  },
  {
    id: "dist-unavailable",
    topic: "distribution",
    question: "A store shows my book as \"unavailable\". Why?",
    answer:
      "This is usually a stock sync issue between BookLeaf and the store. Tell us which store it is and we will re-sync the listing, which takes 24–48 hours.",
    link: { to: ASK, label: "Report an unavailable listing" },
  },
  {
    id: "prod-stages",
    topic: "production",
    question: "What stages does my book go through before it's published?",
    answer:
      "Manuscript Received, Editing (if you opted for it), Cover Design, Typesetting, Proofreading, ISBN Assignment, Printing, Distribution Setup, then Published & Live. My books shows the stage each of your books is at.",
    link: { to: BOOKS, label: "Track your books" },
  },
  {
    id: "prod-delays",
    topic: "production",
    question: "Why is my book taking longer than expected?",
    answer:
      "Delays usually happen at two stages: Cover Design, while we wait for your approval of the cover, and Proofreading, when revisions are needed.",
    link: { to: BOOKS, label: "Check your book's stage" },
  },
  {
    id: "packages",
    topic: "production",
    question: "Which publishing packages does BookLeaf offer?",
    answer: "There are two packages: Standard Free and Bestseller Breakthrough.",
  },
  {
    id: "escalation",
    topic: "general",
    question: "What happens if my question needs escalating?",
    answer:
      "When we escalate an issue, we give you a clear timeline, such as 48 hours, so you know when to expect an answer.",
    link: { to: ASK, label: "Ask our team" },
  },
];

/** Lower-cased words of the query; empty when the query is blank. */
export const searchTerms = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/** True when every search word appears in the question or the answer. */
export function faqMatches(faq: Faq, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${faq.question} ${faq.answer}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
