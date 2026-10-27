/**
 * Author "instant answer": a short, grounded reply to a question before the
 * author raises a ticket. Grounded on the author's OWN books and royalty
 * position (never anyone else's) and on the retrieved KB sections.
 *
 * - One LLM call per distinct (author, question, book, facts, prompt) tuple;
 *   repeats are served from an in-process LRU (200 entries, 1 h).
 * - Every amount and date in the model's answer must appear in the facts or
 *   the KB text; otherwise the answer is dropped for the template.
 * - Never fails for the author because of the AI: when it is unavailable,
 *   rate limited or returns unusable output, a deterministic template built
 *   from the best KB section and the author's facts is returned instead.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AnswerConfidence, AnswerDto, AnswerRequest, TicketCategory } from "@bookleaf/shared";
import type { Db } from "../db/client.js";
import { books } from "../db/schema.js";
import { formatLongDate, royaltyCycle, toIsoDate } from "../lib/dates.js";
import { validationError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { summarizeRoyalty } from "../modules/books/mappers.js";
import type { AnswerService } from "./index.js";
import { KB_SECTIONS, KB_VERSION, type KbSection } from "./knowledge-base.js";
import type { CallPurpose, GuardedLlm } from "./llm-client.js";
import {
  ANSWER_MAX_TOKENS,
  ANSWER_PROMPT_VERSION,
  ANSWER_SYSTEM,
  answerOutputSchema,
  buildAnswerUser,
} from "./prompts/answer.js";
import { AiError } from "./provider.js";
import { retrieveKb } from "./retrieval.js";
import { classifyByRules, hasLegalLanguage } from "./rules-classifier.js";
import { productionStage } from "./templates.js";
import { inr, isPublished, type BookRow } from "./ticket-context.js";

/**
 * Recorded in ai_calls.purpose. `CallPurpose` (llm-client.ts) does not list
 * "answer" yet; the column is free text, so the value is stored as-is.
 */
const ANSWER_PURPOSE = "answer" as CallPurpose;

export const ANSWER_CACHE_MAX = 200;
export const ANSWER_CACHE_TTL_MS = 60 * 60_000;

export const NOTICE_UNAVAILABLE = "Our assistant is unavailable right now, here is what our policy says.";
export const NOTICE_UNVERIFIED = "We couldn't check the assistant's answer against your account, so here is what our policy says.";

/** Categories where the honest answer is "a person has to check this". */
const NEEDS_A_PERSON: readonly TicketCategory[] = ["printing_quality", "isbn_metadata"];

/** Output that is the model talking about itself rather than answering. */
const NOT_AN_ANSWER = /^(?:i'm sorry,? but|i am sorry,? but|i can(?:no|')t help|i am unable|i'm unable|as an ai)\b/i;

export interface AnswerAuthor {
  /** users.id: the cache key and rate-limit owner. */
  userId: string;
  authorId: string;
}

// ---------------------------------------------------------------------------
// Facts (this author's data only)
// ---------------------------------------------------------------------------

interface AnswerFacts {
  text: string;
  today: string;
  books: BookRow[];
  book: BookRow | null;
  royalty: ReturnType<typeof summarizeRoyalty>;
  lastPayout: string | null;
}

const longDate = (iso: string) => formatLongDate(iso);

function bookLine(b: BookRow): string {
  if (!isPublished(b)) {
    return `- "${b.title}" (${b.id}): in production, current stage ${productionStage(b.status)}. Not on sale yet, so no sales or royalties yet.`;
  }
  const parts = [
    `- "${b.title}" (${b.id}): Published & Live${b.publicationDate ? ` since ${longDate(b.publicationDate)}` : ""}`,
    `royalty earned ${inr(b.totalRoyaltyEarned)}, paid ${inr(b.royaltyPaid)}, pending ${inr(b.royaltyPending)}`,
    `last payout ${b.lastRoyaltyPayoutDate ? longDate(b.lastRoyaltyPayoutDate) : "none recorded"}`,
  ];
  if (b.isbn) parts.push(`ISBN ${b.isbn}`);
  parts.push(`available on ${b.availableOn.length ? b.availableOn.join(", ") : "no platforms listed"}`);
  return parts.join("; ");
}

function buildFacts(rows: BookRow[], book: BookRow | null, now: Date): AnswerFacts {
  const today = toIsoDate(now);
  const royalty = summarizeRoyalty(rows, now);
  const cycle = royaltyCycle(now);
  const lastPayout = rows.reduce<string | null>(
    (latest, b) => (b.lastRoyaltyPayoutDate && (!latest || b.lastRoyaltyPayoutDate > latest) ? b.lastRoyaltyPayoutDate : latest),
    null,
  );
  const lines = [
    `Today: ${longDate(today)}`,
    book ? `The question is about: "${book.title}" (${book.id})` : "The question is about: the author's account in general (no book selected)",
    "Your books:",
    ...(rows.length ? rows.map(bookLine) : ["- none yet"]),
    "Your royalty position across all your books:",
    `- Total pending: ${inr(royalty.totalPending)}. Payout minimum: ${inr(royalty.payoutThreshold)}. ${
      royalty.totalPending <= 0
        ? "Nothing is pending."
        : royalty.meetsThreshold
          ? "The pending amount meets the minimum, so it is paid with the next payout."
          : "The pending amount is below the minimum, so it rolls over to the next quarter."
    }`,
    `- Most recent payout on any of your books: ${lastPayout ? longDate(lastPayout) : "none recorded"}`,
    `- The last quarter closed on ${longDate(cycle.previousQuarterEnd)}; the current quarter closes on ${longDate(royalty.currentQuarterEnd)}.`,
    `- Next payout due by: ${longDate(royalty.nextPayoutDueBy)}`,
    "- Bank details: not visible here (the team can check them).",
  ];
  return { text: lines.join("\n"), today, books: rows, book, royalty, lastPayout };
}

// ---------------------------------------------------------------------------
// Figure verification: every amount and date the model writes must be grounded
// ---------------------------------------------------------------------------

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1;

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const DAY_MONTH = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b\\.?,?(?:\\s+(\\d{4}))?`, "gi");
const MONTH_DAY = new RegExp(`\\b${MONTH}\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi");
/** Currency-marked amounts, and grouped numbers (1,000 / 1,00,000) which read as amounts. */
const AMOUNT = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:rupees|inr)\b|(?<![\d.])(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?)/gi;
const ANY_NUMBER = /\d[\d,]*(?:\.\d+)?/g;

interface DateMention {
  month: number;
  day: number;
  year: number | null;
  text: string;
}

const toNumber = (s: string) => Number(s.replace(/,/g, ""));

function dateMentions(text: string): DateMention[] {
  const out: DateMention[] = [];
  for (const m of text.matchAll(ISO_DATE)) out.push({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), text: m[0] });
  for (const m of text.matchAll(DAY_MONTH))
    out.push({ day: Number(m[1]), month: monthIndex(m[2]!), year: m[3] ? Number(m[3]) : null, text: m[0] });
  for (const m of text.matchAll(MONTH_DAY))
    out.push({ month: monthIndex(m[1]!), day: Number(m[2]), year: m[3] ? Number(m[3]) : null, text: m[0] });
  return out.filter((d) => d.month >= 1 && d.day >= 1 && d.day <= 31);
}

/**
 * Amounts and dates in `answer` that do not appear anywhere in `grounding`
 * (the facts plus the KB sections given to the model). Empty = verified.
 */
export function unverifiedFigures(answer: string, grounding: string): string[] {
  const knownNumbers = new Set([...grounding.matchAll(ANY_NUMBER)].map((m) => toNumber(m[0])));
  const knownDates = dateMentions(grounding);
  const problems: string[] = [];
  for (const m of answer.matchAll(AMOUNT)) {
    const raw = m[1] ?? m[2] ?? m[3]!;
    if (!knownNumbers.has(toNumber(raw))) problems.push(m[0].trim());
  }
  for (const d of dateMentions(answer)) {
    const ok = knownDates.some((k) => k.month === d.month && k.day === d.day && (d.year === null || k.year === null || k.year === d.year));
    if (!ok) problems.push(d.text.replace(/[\s.,]+$/, ""));
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Template (degraded mode)
// ---------------------------------------------------------------------------

const bullets = (section: KbSection) =>
  section.body
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);

function accountLine(category: TicketCategory, f: AnswerFacts): string | null {
  const b = f.book;
  switch (category) {
    case "royalty_payments": {
      const r = f.royalty;
      if (r.totalPending <= 0) return `You have nothing pending right now. The next payout is due by ${longDate(r.nextPayoutDueBy)}.`;
      return r.meetsThreshold
        ? `You have ${inr(r.totalPending)} pending across your books, which meets the ${inr(r.payoutThreshold)} minimum, and the next payout is due by ${longDate(r.nextPayoutDueBy)}.`
        : `You have ${inr(r.totalPending)} pending across your books, which is below the ${inr(r.payoutThreshold)} minimum, so it rolls over to the next quarter.`;
    }
    case "book_status_production": {
      const target = b ?? f.books.find((x) => !isPublished(x)) ?? null;
      if (!target) return null;
      return isPublished(target)
        ? `"${target.title}" is published and live.`
        : `"${target.title}" is currently at the ${productionStage(target.status)} stage.`;
    }
    case "distribution_availability":
      return b && isPublished(b) && b.availableOn.length ? `"${b.title}" is listed on ${b.availableOn.join(", ")}.` : null;
    case "isbn_metadata":
      return b?.isbn ? `The ISBN on record for "${b.title}" is ${b.isbn}.` : null;
    default:
      return null;
  }
}

function templateAnswer(
  category: TicketCategory,
  sections: readonly KbSection[],
  facts: AnswerFacts,
  opts: { matchedRules: boolean; text: string; notice: string },
): AnswerDto {
  const best = sections[0] ?? KB_SECTIONS.find((s) => s.id === "company")!;
  const paragraphs = [`Here is what our ${best.title} says: ${bullets(best).slice(0, 2).join(" ")}`];
  const account = accountLine(category, facts);
  if (account) paragraphs.push(account);
  paragraphs.push("If this doesn't answer your question, send your query and our team will look into it.");

  const confidence: AnswerConfidence =
    !opts.matchedRules || NEEDS_A_PERSON.includes(category) || hasLegalLanguage(opts.text) ? "low" : "medium";
  return {
    answer: paragraphs.join("\n\n"),
    confidence,
    sources: [{ id: best.id, title: best.title }],
    source: "template",
    notice: opts.notice,
    canSubmitAnyway: true,
    suggestedCategory: category,
  };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** Tiny LRU with a TTL: Map keeps insertion order, so the first key is the least recently used. */
class LruCache<V> {
  private readonly map = new Map<string, { value: V; expiresAt: number }>();
  constructor(
    private readonly max: number,
    private readonly ttlMs: number,
    private readonly clock: () => number,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    this.map.delete(key);
    if (hit.expiresAt <= this.clock()) return undefined;
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.clock() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface AnswerServiceDeps {
  db: Db;
  log: Logger;
  llm: GuardedLlm;
  /** Model used for answers (the drafting model: short, fast replies). */
  model: string;
  now: () => Date;
  /** Clock for cache expiry (tests); defaults to Date.now. */
  cacheNow?: () => number;
}

export function createAnswerService(deps: AnswerServiceDeps): AnswerService {
  const { db, log, llm, model } = deps;
  const cache = new LruCache<AnswerDto>(ANSWER_CACHE_MAX, ANSWER_CACHE_TTL_MS, deps.cacheNow ?? (() => Date.now()));

  return {
    async answer(author: AnswerAuthor, input: AnswerRequest): Promise<AnswerDto> {
      const rows = await db.select().from(books).where(eq(books.authorId, author.authorId)).orderBy(books.id);
      const bookId = input.bookId ?? null;
      const book = bookId ? (rows.find((b) => b.id === bookId) ?? null) : null;
      if (bookId && !book) {
        throw validationError([{ field: "bookId", message: "Choose one of your books, or General / Account Level" }]);
      }

      const subject = input.subject?.trim() || undefined;
      const text = [subject ?? "", input.question].join("\n");
      const rules = classifyByRules(subject ?? "", input.question);
      const category = rules.category;
      const kb = retrieveKb(category, text);
      const facts = buildFacts(rows, book, deps.now());
      const fallback = (notice: string) =>
        templateAnswer(category, kb.sections, facts, { matchedRules: rules.confidence > 0.2, text, notice });

      const key = createHash("sha256")
        .update(
          JSON.stringify({
            v: ANSWER_PROMPT_VERSION,
            kb: KB_VERSION,
            model,
            author: author.userId,
            question: input.question,
            subject,
            bookId,
            facts: facts.text,
          }),
        )
        .digest("hex");
      const hit = cache.get(key);
      if (hit) return hit;

      try {
        const result = await llm.structured(ANSWER_PURPOSE, null, {
          model,
          system: ANSWER_SYSTEM,
          user: buildAnswerUser({ today: facts.today, sections: kb.sections, facts: facts.text, subject, question: input.question }),
          maxTokens: ANSWER_MAX_TOKENS,
          schema: answerOutputSchema,
        });
        const answer = result.value.answer.trim();
        if (!answer || NOT_AN_ANSWER.test(answer)) {
          throw new AiError("invalid_output", "Answer output is empty or not an answer", result.usage);
        }

        const grounding = [facts.text, ...kb.sections.map((s) => s.body)].join("\n");
        const unverified = unverifiedFigures(answer, grounding);
        if (unverified.length) {
          log.warn({ authorId: author.authorId, category, unverified }, "instant answer had figures not in the facts; using template");
          return fallback(NOTICE_UNVERIFIED);
        }

        const used = new Set(result.value.usedSections);
        const dto: AnswerDto = {
          answer,
          confidence: result.value.confidence,
          sources: kb.sections.filter((s) => used.has(s.id)).map((s) => ({ id: s.id, title: s.title })),
          source: "ai",
          notice: null,
          canSubmitAnyway: true,
          suggestedCategory: category,
        };
        cache.set(key, dto);
        return dto;
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        log.info({ authorId: author.authorId, kind: e.kind, reason: e.reason }, "instant answer fell back to template");
        return fallback(NOTICE_UNAVAILABLE);
      }
    },
  };
}
