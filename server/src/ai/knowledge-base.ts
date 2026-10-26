/**
 * BookLeaf Knowledge Base, split into sections so each prompt only carries
 * what the ticket needs (see retrieval.ts). Content mirrors the policies
 * BookLeaf supplied; edit here and bump KB_VERSION so cached drafts that were
 * grounded on the old text are regenerated.
 */
import type { TicketCategory } from "@bookleaf/shared";

export const KB_VERSION = "2026-10-26.1";

export interface KbSection {
  id: string;
  title: string;
  /** Categories for which this section is always included. */
  categories: readonly TicketCategory[];
  /** Lower-case keywords that pull the section in regardless of category. */
  keywords: readonly string[];
  body: string;
}

export const KB_SECTIONS: readonly KbSection[] = [
  {
    id: "company",
    title: "Company Overview",
    categories: ["general_inquiry"],
    keywords: ["package", "bestseller breakthrough", "standard free", "plan", "upgrade"],
    body: `- BookLeaf Publishing is a self-publishing company operating in India and the US.
- Publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).
- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for its authors.
- In-house printing facility and warehouse are in Delhi. Print partners include Repro India and Epitome Books.`,
  },
  {
    id: "royalty",
    title: "Royalty Policy",
    categories: ["royalty_payments"],
    keywords: ["royalt", "payout", "payment", "paid", "bank", "earning", "money", "₹", "inr"],
    body: `- 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.
- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.
- Royalties are calculated quarterly and paid within 45 days of the quarter ending.
- Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter.
- Payouts are made via bank transfer to the account linked in the author's dashboard.
- Authors can view a detailed royalty breakdown in their dashboard, showing sales figures per platform.`,
  },
  {
    id: "isbn",
    title: "ISBN Policy",
    categories: ["isbn_metadata"],
    keywords: ["isbn", "imprint", "barcode", "metadata", "duplicate"],
    body: `- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.
- ISBNs are registered under BookLeaf's publisher imprint. An author who wants an ISBN under their own imprint must obtain it independently.
- An ISBN error (duplicate, wrong book linked) is a high-priority issue and is escalated to the production team.`,
  },
  {
    id: "printing",
    title: "Printing & Quality",
    categories: ["printing_quality"],
    keywords: ["print", "misprint", "binding", "blurry", "quality", "defect", "copies", "reprint", "pages"],
    body: `- In-house printing handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.
- Standard print turnaround: 5–7 business days from order confirmation.
- For a quality issue (misprints, binding defects, colour inconsistency) BookLeaf arranges a free reprint after verification. The author may need to share photos of the defective copy.`,
  },
  {
    id: "distribution",
    title: "Distribution & Availability",
    categories: ["distribution_availability"],
    keywords: ["amazon", "flipkart", "unavailable", "listing", "stock", "store", "out of stock", "buy"],
    body: `- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.
- New listings typically go live within 7–10 business days after publication is complete.
- A book showing as unavailable on a platform usually indicates a stock sync issue; BookLeaf's team can trigger a re-sync within 24–48 hours.`,
  },
  {
    id: "production",
    title: "Production Stages",
    categories: ["book_status_production"],
    keywords: ["typesetting", "cover", "proof", "editing", "stage", "production", "status", "when will", "delay"],
    body: `- Stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
- Authors are updated at each stage via email. Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).`,
  },
  {
    id: "metadata_updates",
    title: "Metadata & Listing Updates",
    categories: ["general_inquiry", "isbn_metadata"],
    keywords: ["description", "bio", "update", "change", "blurb", "author page"],
    body: `- Metadata updates (book description, author bio) can be submitted through the dashboard or by emailing the BookLeaf team.
- Changes typically reflect on platforms within 3–5 business days.`,
  },
];

/** Always included in drafting prompts: this is how BookLeaf sounds. */
export const TONE_GUIDELINES = `- Always empathetic and professional. Authors are our partners, not customers to be managed.
- Acknowledge the author's concern before jumping to solutions.
- Be specific: include actual numbers, dates, and statuses wherever possible rather than vague reassurances.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If the issue requires escalation or investigation, give a clear timeline ("Our team will look into this and get back to you within 48 hours") rather than open-ended promises.
- Always end with a clear next step for the author and/or the BookLeaf team.`;

export interface KbExample {
  category: TicketCategory;
  query: string;
  guidance: string;
}

/** Calibration examples supplied by BookLeaf. Only the matching category's examples go into a prompt. */
export const KB_EXAMPLES: readonly KbExample[] = [
  {
    category: "royalty_payments",
    query: "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    guidance:
      "Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check if their bank details are linked. Provide the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.",
  },
  {
    category: "royalty_payments",
    query: "My royalty amount seems too low. I sold 200 copies but only received ₹3,000.",
    guidance:
      "Explain the net profit calculation: MRP minus printing, platform commission, and shipping. Offer to share a detailed line-by-line royalty breakdown. Don't be defensive—offer transparency.",
  },
  {
    category: "isbn_metadata",
    query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    guidance:
      "Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.",
  },
  {
    category: "printing_quality",
    query: "I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.",
    guidance:
      "Apologise sincerely. Ask the author to share photos of the defective copies. Confirm that BookLeaf will arrange a free reprint once verified. Provide a timeline of 5–7 business days for the reprint.",
  },
  {
    category: "distribution_availability",
    query: "My book is published but it's showing as \"Currently Unavailable\" on Amazon.",
    guidance:
      "Explain that this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24–48 hours for it to go live again.",
  },
  {
    category: "book_status_production",
    query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
    guidance:
      "Check the actual production status. If it's delayed, be honest about why (e.g., waiting on author approval for proofs). Provide a specific updated timeline. Don't blame the author even if the delay is on their side—frame it collaboratively.",
  },
  {
    category: "general_inquiry",
    query: "Can I update the description of my book on Amazon after it's already live?",
    guidance:
      "Yes, metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.",
  },
];
