/**
 * Deterministic fallback classifier, used when the AI is unavailable (and to
 * pick KB sections for a draft before classification has finished). Weighted
 * keyword scoring per category plus a priority rubric mirroring the AI's.
 * Confidence is capped at 0.5 so admins can tell it apart from AI output.
 * It fills the same triage fields as the AI (sentiment, summary, next action,
 * escalation, language) from simple text heuristics.
 */
import type { TicketCategory, TicketPriority, TriageLanguage, TriageSentiment } from "@bookleaf/shared";
import { truncate } from "./prompts/common.js";
import { matchesKeyword } from "./retrieval.js";

export const SUMMARY_MAX_CHARS = 200;
export const NEXT_ACTION_MAX_CHARS = 160;
export const ESCALATE_REASON_MAX_CHARS = 160;

export interface ClassificationResult {
  category: TicketCategory;
  priority: TicketPriority;
  confidence: number;
  rationale: string;
  sentiment: TriageSentiment;
  summary: string;
  nextAction: string;
  escalate: boolean;
  escalateReason: string | null;
  language: TriageLanguage;
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
/** Stricter than LONG_WAIT: only an explicit year or more counts towards escalation. */
const YEAR_WAIT = /\b(?:a|one|over a|more than a|\d+)\s+years?\b|\b(?:1[2-9]|[2-9]\d)\s+months?\b|\b(?:twelve|eighteen)\s+months?\b/i;

const any = (text: string, words: readonly string[]) => words.some((w) => matchesKeyword(text, w));
const count = (text: string, words: readonly string[]) => words.filter((w) => matchesKeyword(text, w)).length;
export const hasLegalLanguage = (text: string) => any(text, LEGAL) || any(text, DATA_LOSS);
export const hasIsbnErrorLanguage = (text: string) => any(text, ISBN_ERROR);

// --- Sentiment ----------------------------------------------------------------

const ANGRY = [
  "unacceptable", "cheat", "fraud", "scam", "legal", "lawyer", "worst", "furious", "disgusting", "pathetic",
  "ridiculous", "shameful", "useless", "outrageous", "fed up", "looted",
];
const FRUSTRATED = [
  "frustrat", "disappoint", "annoy", "upset", "terrible", "horrible", "still waiting", "still haven't", "still not",
  "no response", "no reply", "nobody", "no one", "again and again", "how long", "what's going on", "kab tak",
];
const CONCERNED = [
  "worried", "concern", "confused", "not sure", "seems", "too low", "not received", "haven't received", "missing",
  "delay", "wrong", "different", "issue", "problem", "unavailable", "blurry", "misaligned", "damaged",
];
const POLITE = ["please", "kindly", "thank", "appreciate", "grateful", "could you", "would you", "regards"];

/** Share of letters that are upper-case, ignoring short texts and acronyms (ISBN, INR, ASAP). */
function capsRatio(text: string): number {
  const letters = text.replace(/\b[A-Z]{2,4}\b/g, "").match(/[A-Za-z]/g) ?? [];
  if (letters.length < 12) return 0;
  return letters.filter((c) => c >= "A" && c <= "Z").length / letters.length;
}

/** Keyword and punctuation heuristics: abusive/threat words and shouting read as angry, waiting and disappointment as frustrated. */
export function rulesSentiment(text: string): TriageSentiment {
  const angry = count(text, ANGRY);
  const shouting = capsRatio(text) >= 0.5 || /!{3,}/.test(text);
  if (angry >= 2 || (angry >= 1 && shouting)) return "angry";
  const frustrated = count(text, FRUSTRATED) + (/!{2,}|\?{2,}/.test(text) ? 1 : 0);
  if (angry >= 1 || shouting || frustrated >= 2) return "frustrated";
  if (frustrated === 1) return any(text, POLITE) ? "concerned" : "frustrated";
  return any(text, CONCERNED) ? "concerned" : "calm";
}

// --- Language -----------------------------------------------------------------

const DEVANAGARI = /[\u0900-\u097F]/g;
const HINGLISH = new Set([
  "hai", "hain", "nahi", "nahin", "nhi", "kya", "kab", "kyun", "kyu", "kyunki", "mera", "meri", "mere", "mujhe",
  "humne", "abhi", "tak", "kuch", "paisa", "paise", "bhi", "aur", "hua", "hui", "hoga", "karo", "kijiye", "gaya",
  "gayi", "raha", "rahi", "rahe", "wala", "wali", "yaar", "bhai", "kitna", "kitne", "kaise", "kahan", "lekin",
  "sirf", "bahut", "bohot", "diya", "mila", "mili", "milega", "chahiye", "batao", "bataiye",
]);

/** Devanagari script means Hindi; two or more distinct common Hindi words in Latin script means Hinglish. */
export function detectLanguage(text: string): TriageLanguage {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const devanagari = text.match(DEVANAGARI)?.length ?? 0;
  if (devanagari > 0 && devanagari >= letters * 0.3) return "hi";
  const words = new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
  if ([...words].filter((w) => HINGLISH.has(w)).length >= 2) return devanagari > 0 ? "hi" : "hinglish";
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return letters > 0 && latin < letters * 0.5 ? "other" : "en";
}

// --- Escalation ----------------------------------------------------------------

const PUBLIC_SHAMING = [
  "social media", "twitter", "instagram", "facebook", "linkedin", "youtube", "bad review", "negative review",
  "1 star", "one star", "review everywhere", "expose", "tell everyone", "go public", "post about",
];
const REPEATED_CONTACT = [
  "third time", "3rd time", "fourth time", "again and again", "multiple times", "several times", "many times",
  "so many emails", "many emails", "every week", "repeatedly", "no response", "no reply", "keep asking",
];
const PRIVACY_SAFETY = [
  "privacy", "personal data", "personal details", "data leak", "leaked", "hacked", "someone else's", "unsafe", "threaten",
];

/** Text-only escalation triggers (the facts-based angry + overdue rule lives in policy.ts). Returns the reason or null. */
export function escalationSignal(category: TicketCategory, text: string): string | null {
  if (any(text, LEGAL)) return "Legal threat or fraud allegation";
  if (any(text, DATA_LOSS) || any(text, PRIVACY_SAFETY)) return "Data-privacy, data-loss or safety concern";
  if (any(text, PUBLIC_SHAMING)) return "Threat of a public review or social-media complaint";
  if (category === "royalty_payments" && any(text, NON_RECEIPT) && YEAR_WAIT.test(text)) {
    return "Royalties withheld for about a year or more";
  }
  if (any(text, REPEATED_CONTACT)) return "Repeated contact without a resolution";
  return null;
}

// --- Summary and next action -------------------------------------------------------

/** First sentence of the description (or the subject when there is none), whitespace-collapsed and length-capped. */
export function firstSentence(subject: string, description: string): string {
  const source = description.trim() || subject.trim();
  const first = source.split(/(?<=[.!?])\s+|\n+/).find((s) => s.trim()) ?? source;
  return truncate(first.replace(/\s+/g, " ").trim(), SUMMARY_MAX_CHARS);
}

export const NEXT_ACTIONS: Record<TicketCategory, string> = {
  royalty_payments: "Check the author's payout ledger for the last quarter and confirm their bank details are linked.",
  isbn_metadata: "Compare the ISBN on each listing with the printed copy and escalate any mismatch to production.",
  printing_quality: "Ask for photos of the defective copies and arrange a free reprint once verified.",
  distribution_availability: "Check the listing on each platform and trigger a stock re-sync with distribution.",
  book_status_production: "Check the book's current production stage and give the author a dated timeline.",
  general_inquiry: "Answer the question directly and point the author to the right dashboard page.",
};

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
  const escalateReason = escalationSignal(best.category, text);
  return {
    category: best.category,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    rationale: `Rule-based fallback (AI unavailable): ${matched}; priority ${priority} (${why}).`,
    sentiment: rulesSentiment(text),
    summary: firstSentence(subject, description),
    nextAction: NEXT_ACTIONS[best.category],
    escalate: escalateReason !== null,
    escalateReason,
    language: detectLanguage(text),
  };
}
