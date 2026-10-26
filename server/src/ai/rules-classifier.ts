/**
 * Deterministic fallback classifier, used when the AI is unavailable (and to
 * pick KB sections for a draft before classification has finished). Weighted
 * keyword scoring per category plus a priority rubric mirroring the AI's.
 * Confidence is capped at 0.5 so admins can tell it apart from AI output.
 */
import type { TicketCategory, TicketPriority } from "@bookleaf/shared";
import { matchesKeyword } from "./retrieval.js";

export interface ClassificationResult {
  category: TicketCategory;
  priority: TicketPriority;
  confidence: number;
  rationale: string;
}

const CATEGORY_KEYWORDS: Record<TicketCategory, Record<string, number>> = {
  royalty_payments: {
    royalt: 3, payout: 3, payment: 2, paid: 2, bank: 2, earning: 2, "₹": 2, inr: 2, money: 2,
    statement: 2, "net profit": 2, commission: 1, amount: 1,
  },
  isbn_metadata: {
    isbn: 4, barcode: 3, imprint: 3, metadata: 3, "wrong title": 2, "author name": 2, misspelled: 2, duplicate: 1,
  },
  printing_quality: {
    misprint: 3, binding: 3, blurry: 3, defect: 3, damaged: 3, misaligned: 3, smudge: 3, torn: 3, faded: 3, reprint: 3,
    print: 2, quality: 2, "author copies": 2, pages: 1, colour: 1, color: 1,
  },
  distribution_availability: {
    unavailable: 3, "out of stock": 3, "not available": 3, distribution: 3, listing: 2, listed: 2,
    "can't find": 2, "cannot find": 2, amazon: 1, flipkart: 1, store: 1, buy: 1,
  },
  book_status_production: {
    typesetting: 3, proofread: 3, "cover design": 3, manuscript: 3, production: 3, editing: 2, proof: 2,
    stage: 2, "when will": 2, timeline: 2, delay: 2, "still in": 2, "still at": 2, cover: 1, ready: 1,
  },
  general_inquiry: {
    "bestseller breakthrough": 3, update: 2, description: 2, bio: 2, blurb: 2, "author page": 2, package: 2,
    upgrade: 2, contract: 2, marketing: 2, "can i": 1, "how do i": 1, "how can i": 1, change: 1,
  },
};

const LEGAL = ["legal", "lawyer", "lawsuit", "sue", "court", "consumer forum", "police", "fraud", "scam", "cheat"];
const DATA_LOSS = ["lost my manuscript", "deleted my", "data loss"];
const NON_RECEIPT = [
  "not received", "haven't received", "have not received", "never received", "didn't receive", "did not receive",
  "no payment", "not paid", "not been paid", "no royalty", "overdue", "missing", "still waiting",
];
const DEFECT = ["blurry", "misprint", "damaged", "defect", "binding", "misaligned", "torn", "smudge", "missing pages"];
const UNAVAILABLE = ["unavailable", "out of stock", "not available", "can't find", "cannot find"];
const TIME_BOUND = ["urgent", "asap", "deadline", "launch", "event", "promotion", "this weekend", "tomorrow", "book fair"];
export const ISBN_ERROR = ["wrong", "different", "duplicate", "mismatch", "incorrect", "not match", "doesn't match", "does not match"];
const LONG_WAIT = /\b(?:a|one|over a|more than a|\d+)\s+years?\b|\b(?:1[2-9]|[2-9]\d)\s+months?\b|\b(?:twelve|eighteen)\s+months?\b|\bsince (?:launch|publication|it was published)\b|\bsingle royalty\b/i;

const any = (text: string, words: readonly string[]) => words.some((w) => matchesKeyword(text, w));
export const hasLegalLanguage = (text: string) => any(text, LEGAL) || any(text, DATA_LOSS);
export const hasIsbnErrorLanguage = (text: string) => any(text, ISBN_ERROR);

function rulesPriority(category: TicketCategory, text: string): { priority: TicketPriority; why: string } {
  const nonReceipt = category === "royalty_payments" && any(text, NON_RECEIPT);
  if (hasLegalLanguage(text)) return { priority: "critical", why: "legal or data-loss language" };
  if (nonReceipt && LONG_WAIT.test(text)) return { priority: "critical", why: "royalties withheld for a long time" };
  if (category === "isbn_metadata" && hasIsbnErrorLanguage(text)) return { priority: "high", why: "ISBN error" };
  if (nonReceipt) return { priority: "high", why: "royalty not received" };
  if (any(text, UNAVAILABLE) && category === "distribution_availability") return { priority: "high", why: "book unavailable" };
  if (any(text, DEFECT)) return { priority: "high", why: "defective copies" };
  if (any(text, TIME_BOUND)) return { priority: "high", why: "time-bound request" };
  if (category === "general_inquiry") return { priority: "low", why: "general how-to" };
  return { priority: "medium", why: "status or explanation request" };
}

export function classifyByRules(subject: string, description: string): ClassificationResult {
  const text = `${subject}\n${description}`;
  let best: { category: TicketCategory; score: number; matched: string[] } = {
    category: "general_inquiry",
    score: 0,
    matched: [],
  };
  for (const [category, weights] of Object.entries(CATEGORY_KEYWORDS) as [TicketCategory, Record<string, number>][]) {
    const matched = Object.keys(weights).filter((k) => matchesKeyword(text, k));
    const score = matched.reduce((n, k) => n + (weights[k] ?? 0), 0);
    if (score > best.score) best = { category, score, matched };
  }
  const { priority, why } = rulesPriority(best.category, text);
  const confidence = best.score === 0 ? 0.2 : Math.min(0.5, 0.25 + best.score * 0.03);
  const matched = best.matched.length ? `matched ${best.matched.map((k) => `'${k}'`).join(", ")}` : "no keywords matched";
  return {
    category: best.category,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    rationale: `Rule-based fallback (AI unavailable): ${matched}; priority ${priority} (${why}).`,
  };
}
