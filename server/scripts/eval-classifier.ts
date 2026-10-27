/**
 * Classifier evaluation: runs BookLeaf's 7 calibration queries plus a set of
 * harder, realistic ones through the rule-based classifier and, when
 * an LLM key is set (GEMINI_API_KEY or ANTHROPIC_API_KEY, chosen as by
 * AI_PROVIDER), the live AI classifier (same prompt, schema,
 * model and policy guardrails as production). Prints a per-case table and
 * category accuracy for each.
 *
 *   npm run eval:classifier -w server
 *
 * Each case is classified as an account-level ticket (no book facts), so the
 * AI judges on the ticket text alone, as the rules do.
 */
import type { TicketCategory, TicketPriority } from "@bookleaf/shared";
import { CircuitBreaker } from "../src/ai/circuit-breaker.js";
import { KB_EXAMPLES } from "../src/ai/knowledge-base.js";
import { createGuardedLlm } from "../src/ai/llm-client.js";
import { applyPolicy } from "../src/ai/policy.js";
import { buildClassificationUser, CLASSIFY_MAX_TOKENS, CLASSIFY_SYSTEM, classificationSchema } from "../src/ai/prompts.js";
import { createProviderFromEnv } from "../src/ai/provider-factory.js";
import { createRateLimiter } from "../src/ai/rate-limiter.js";
import { classifyByRules } from "../src/ai/rules-classifier.js";
import type { TicketContext } from "../src/ai/ticket-context.js";
import { loadEnv } from "../src/config/env.js";
import { toIsoDate } from "../src/lib/dates.js";
import { createLogger } from "../src/lib/logger.js";
import { summarizeRoyalty } from "../src/modules/books/mappers.js";

interface Case {
  expected: TicketCategory;
  subject: string;
  description: string;
}

const EXTRA_CASES: Case[] = [
  {
    expected: "royalty_payments",
    subject: "Flipkart sales missing from my statement",
    description: "My dashboard shows 40 copies sold on Flipkart last quarter but the royalty statement shows zero for Flipkart. Can you explain?",
  },
  {
    expected: "royalty_payments",
    subject: "Changed my bank",
    description: "I have moved to a new bank. How do I update the account my royalties are paid into before the next payout?",
  },
  {
    expected: "royalty_payments",
    subject: "Over a year without payment",
    description: "It has been more than a year since my book launched and I have never received a single rupee. I am considering legal action.",
  },
  {
    expected: "isbn_metadata",
    subject: "My name is misspelled on Amazon",
    description: "The Amazon listing spells my name as 'Priya Sharmaa'. Please correct the author name on all platforms.",
  },
  {
    expected: "printing_quality",
    subject: "Cover colours look washed out",
    description: "The 50 copies I ordered for my launch event have faded cover colours compared to the proof I approved.",
  },
  {
    expected: "distribution_availability",
    subject: "Not on Flipkart",
    description: "My book went live two weeks ago and I can see it on Amazon, but I cannot find it on Flipkart at all.",
  },
  {
    expected: "book_status_production",
    subject: "Proofreading corrections sent",
    description: "I sent back my proofreading corrections ten days ago and haven't heard anything. When will the book go to print?",
  },
  {
    expected: "general_inquiry",
    subject: "Upgrading my package",
    description: "I published on the Standard Free package. What extra do I get with Bestseller Breakthrough, and can I upgrade an already published book?",
  },
];

const CASES: Case[] = [
  ...KB_EXAMPLES.map((e) => ({ expected: e.category, subject: "", description: e.query })),
  ...EXTRA_CASES,
];

/** Account-level context: the classifier prompt needs only ticket text, today and a royalty summary. */
function syntheticContext(c: Case, now: Date): TicketContext {
  return {
    ticket: { subject: c.subject, description: c.description },
    book: null,
    royalty: summarizeRoyalty([], now),
    today: toIsoDate(now),
  } as unknown as TicketContext;
}

interface Verdict {
  category: TicketCategory | "error";
  priority: TicketPriority | "-";
}

async function main() {
  const env = loadEnv();
  const log = createLogger("silent", false);
  const now = new Date();
  const built = createProviderFromEnv(env, log);
  const llm = built
    ? createGuardedLlm({
        provider: built.provider,
        disabled: false,
        breaker: new CircuitBreaker({ threshold: 1_000, cooldownMs: 1, now: () => Date.now() }),
        record: async () => {},
        log,
        // Same pacing as the app, but a sequential batch run may wait for its slot.
        limiter: createRateLimiter({ limit: env.AI_RPM_LIMIT, maxWaitMs: 65_000 }),
      })
    : null;
  if (built) console.log(`AI provider: ${built.name}, model ${env.AI_CLASSIFY_MODEL}, ${env.AI_RPM_LIMIT} requests/min\n`);

  async function classifyAi(c: Case): Promise<Verdict> {
    if (!llm) return { category: "error", priority: "-" };
    try {
      const { value } = await llm.structured("classify", null, {
        model: env.AI_CLASSIFY_MODEL,
        system: CLASSIFY_SYSTEM,
        user: buildClassificationUser(syntheticContext(c, now)),
        maxTokens: CLASSIFY_MAX_TOKENS,
        schema: classificationSchema,
      });
      const r = applyPolicy(value, `${c.subject}\n${c.description}`);
      return { category: r.category, priority: r.priority };
    } catch (e) {
      console.error(`  AI error: ${e instanceof Error ? e.message : String(e)}`);
      return { category: "error", priority: "-" };
    }
  }

  let rulesCorrect = 0;
  let aiCorrect = 0;
  const rows: string[][] = [];
  for (const [i, c] of CASES.entries()) {
    const text = `${c.subject}\n${c.description}`;
    const rules = applyPolicy(classifyByRules(c.subject, c.description), text);
    const ai = await classifyAi(c);
    if (rules.category === c.expected) rulesCorrect++;
    if (ai.category === c.expected) aiCorrect++;
    const mark = (cat: string) => (cat === c.expected ? "ok " : "XX ");
    rows.push([
      String(i + 1),
      i < KB_EXAMPLES.length ? "kb" : "extra",
      c.expected,
      mark(rules.category) + `${rules.category}/${rules.priority}`,
      llm ? mark(ai.category) + `${ai.category}/${ai.priority}` : "(no API key)",
      (c.subject || c.description).slice(0, 48),
    ]);
  }

  const header = ["#", "set", "expected", "rules (category/priority)", "ai (category/priority)", "ticket"];
  const widths = header.map((h, col) => Math.max(h.length, ...rows.map((r) => r[col]!.length)));
  const line = (r: string[]) => r.map((v, col) => v.padEnd(widths[col]!)).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  const pct = (n: number) => `${n}/${CASES.length} (${Math.round((n / CASES.length) * 100)}%)`;
  console.log(`\nCategory accuracy  rules: ${pct(rulesCorrect)}  ai: ${llm ? pct(aiCorrect) : "skipped (no GEMINI_API_KEY / ANTHROPIC_API_KEY set)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
