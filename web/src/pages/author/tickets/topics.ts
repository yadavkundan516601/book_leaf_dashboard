/**
 * Step 1 of a new query: what the question is about. The topic only guides the author (helper text, an example
 * subject and a checklist); it is never sent to the server and never fills in the author's own text.
 */
export const TOPIC_IDS = ["royalty", "isbn", "printing", "availability", "progress", "other"] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

export interface Topic {
  id: TopicId;
  label: string;
  /** One line on the tile. */
  blurb: string;
  /** Shown above the form once the topic is picked. */
  helper: string;
  subjectExample: string;
  /** "What to include" checklist. */
  include: string[];
}

export const TOPICS: readonly Topic[] = [
  {
    id: "royalty",
    label: "Royalty & payments",
    blurb: "Amounts, payouts, statements",
    helper: "Tell us which payment or statement you're asking about and what you expected to see.",
    subjectExample: "Q2 royalty payout not received",
    include: [
      "Which book, or say it's about all your books",
      "The quarter or payout date you're asking about",
      "The amount you expected and the amount you see",
      "A screenshot of your bank statement or royalty report, if it helps",
    ],
  },
  {
    id: "isbn",
    label: "ISBN & listing details",
    blurb: "ISBN, title, price, description",
    helper: "Tell us which detail is wrong or missing and what it should say.",
    subjectExample: "Wrong author name on the ISBN record",
    include: [
      "Which book",
      "The detail that's wrong (ISBN, title, price, description, author name)",
      "What it says now and what it should say",
      "A screenshot of the listing, if you have one",
    ],
  },
  {
    id: "printing",
    label: "Printing & quality",
    blurb: "Print defects, author copies",
    helper: "Describe the problem with the printed book so we can raise it with the print partner.",
    subjectExample: "Pages misaligned in my author copies",
    include: [
      "Which book",
      "The order number and the date the copies arrived",
      "What's wrong and on which pages",
      "Photos of the problem",
    ],
  },
  {
    id: "availability",
    label: "Availability on Amazon/Flipkart",
    blurb: "Missing, out of stock, wrong listing",
    helper: "Tell us where the book should appear and what you see there instead.",
    subjectExample: "Book shows out of stock on Amazon.in",
    include: [
      "Which book",
      "The store (Amazon, Flipkart or another) and the link to the page",
      "When you last checked and what it showed",
      "A screenshot of the store page",
    ],
  },
  {
    id: "progress",
    label: "Book progress",
    blurb: "Where your book is in production",
    helper: "Pick the book below. We'll show where it is in production before you write to us.",
    subjectExample: "When will typesetting be finished?",
    include: [
      "Which book",
      "The stage you're asking about",
      "Any date you were given or are working towards",
    ],
  },
  {
    id: "other",
    label: "Something else",
    blurb: "Account, contract, anything else",
    helper: "Describe what you need in your own words. Our team will route it to the right person.",
    subjectExample: "Update the email address on my account",
    include: [
      "Which book, if it's about one",
      "Any dates, order numbers or links that help us look into it",
      "Photos or screenshots, if relevant",
    ],
  },
];

export const isTopicId = (v: unknown): v is TopicId => typeof v === "string" && TOPIC_IDS.some((t) => t === v);
export const topicById = (id: TopicId) => TOPICS.find((t) => t.id === id)!;
