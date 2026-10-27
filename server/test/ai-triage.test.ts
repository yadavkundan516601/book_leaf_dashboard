import { describe, expect, it } from "vitest";
import { z } from "zod";
import { KB_EXAMPLES } from "../src/ai/knowledge-base.js";
import { applyPolicy, OVERDUE_PAYOUT_DAYS, type PolicyFacts } from "../src/ai/policy.js";
import { CLASSIFY_SYSTEM, classificationSchema, PROMPT_VERSION } from "../src/ai/prompts.js";
import { classifyByRules, detectLanguage, rulesSentiment, type ClassificationResult } from "../src/ai/rules-classifier.js";

const valid = {
  rationale: "Royalty overdue for two quarters.",
  category: "royalty_payments",
  priority: "high",
  confidence: 0.8,
  sentiment: "frustrated",
  language: "en",
  summary: "Author wants to know why Q2 royalty was not paid.",
  nextAction: "Check Q2 payout ledger and confirm bank details are linked.",
  escalate: false,
  escalateReason: null,
};

describe("classification prompt and schema (triage v2)", () => {
  it("is static, says JSON only, carries the KB examples and the untrusted-text rule", () => {
    expect(PROMPT_VERSION).toBe("2");
    expect(CLASSIFY_SYSTEM).toMatch(/Output only JSON/);
    expect(CLASSIFY_SYSTEM).toMatch(/untrusted/);
    for (const e of KB_EXAMPLES) expect(CLASSIFY_SYSTEM).toContain(e.query);
    expect(CLASSIFY_SYSTEM).toMatch(/hinglish/i);
    // ~1,800 token budget at a conservative 3.5 chars/token.
    expect(CLASSIFY_SYSTEM.length).toBeLessThan(1800 * 3.5);
  });

  it("parses a valid answer unchanged", () => {
    expect(classificationSchema.parse(valid)).toEqual(valid);
  });

  it("truncates over-long strings instead of rejecting them", () => {
    const out = classificationSchema.parse({
      ...valid,
      rationale: "r".repeat(500),
      summary: `${"s".repeat(300)}`,
      nextAction: "n ".repeat(200),
      escalate: true,
      escalateReason: "e".repeat(400),
    });
    expect(out.rationale.length).toBeLessThanOrEqual(240);
    expect(out.summary.length).toBeLessThanOrEqual(200);
    expect(out.summary.endsWith("…")).toBe(true);
    expect(out.nextAction.length).toBeLessThanOrEqual(160);
    expect(out.escalateReason!.length).toBeLessThanOrEqual(160);
  });

  it("turns a blank escalateReason into null", () => {
    expect(classificationSchema.parse({ ...valid, escalateReason: "  " }).escalateReason).toBeNull();
  });

  it.each([
    ["sentiment", "livid"],
    ["language", "fr"],
    ["category", "billing"],
    ["escalate", "yes"],
  ])("rejects a bad %s value", (field, value) => {
    expect(classificationSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });

  it("exports a flat JSON schema (no nested objects) for providers", () => {
    const js = z.toJSONSchema(classificationSchema) as { properties: Record<string, { type?: unknown }> };
    expect(Object.keys(js.properties)).toEqual(Object.keys(valid));
    expect(Object.values(js.properties).every((p) => p.type !== "object")).toBe(true);
  });
});

// ---------------------------------------------------------------------------

const base: ClassificationResult = {
  category: "royalty_payments",
  priority: "medium",
  confidence: 0.9,
  rationale: "x",
  sentiment: "calm",
  summary: "s",
  nextAction: "n",
  escalate: false,
  escalateReason: null,
  language: "en",
};
const overdue: PolicyFacts = { pendingInr: 4500, daysSinceLastPayout: OVERDUE_PAYOUT_DAYS + 1 };
const neverPaid: PolicyFacts = { pendingInr: 1000, daysSinceLastPayout: null };
const current: PolicyFacts = { pendingInr: 4500, daysSinceLastPayout: 40 };
const belowThreshold: PolicyFacts = { pendingInr: 999, daysSinceLastPayout: null };
const TEXT = "Where is my royalty?";

describe("policy v2 matrix", () => {
  it.each([
    // [case, input overrides, text, facts, expected priority, expected escalate, guardrail]
    ["angry + overdue: one level up and escalate", { sentiment: "angry" }, TEXT, overdue, "high", true, "angry_overdue"],
    ["angry + never paid counts as overdue", { sentiment: "angry", priority: "high" }, TEXT, neverPaid, "critical", true, "angry_overdue"],
    ["frustrated + overdue: one level up, no escalation", { sentiment: "frustrated" }, TEXT, overdue, "high", false, "angry_overdue"],
    ["angry + payout within the cycle: unchanged", { sentiment: "angry" }, TEXT, current, "medium", false, null],
    ["angry + pending below threshold: unchanged", { sentiment: "angry" }, TEXT, belowThreshold, "medium", false, null],
    ["calm + overdue: unchanged", { sentiment: "calm" }, TEXT, overdue, "medium", false, null],
    ["angry + overdue without facts: unchanged", { sentiment: "angry" }, TEXT, undefined, "medium", false, null],
    ["critical stays critical (max) but still escalates", { sentiment: "angry", priority: "critical" }, TEXT, overdue, "critical", true, "angry_overdue"],
    ["legal language: critical + escalate", { priority: "low" }, "This is fraud, my lawyer will hear of it", current, "critical", true, "legal"],
    ["ISBN error language: at least high", { category: "distribution_availability", priority: "low" }, "Amazon shows a different ISBN", undefined, "high", false, "isbn_error"],
    ["ISBN question without an error: unchanged", { category: "isbn_metadata", priority: "low" }, "What is an ISBN?", undefined, "low", false, null],
    ["escalated by the model: at least high", { priority: "low", escalate: true, escalateReason: "Bad review threat" }, TEXT, undefined, "high", true, "escalate_floor"],
    ["low confidence never leaves low", { priority: "low", confidence: 0.3 }, TEXT, undefined, "medium", false, "low_confidence"],
    ["low confidence does not lower high", { priority: "high", confidence: 0.3 }, TEXT, undefined, "high", false, null],
  ] as const)("%s", (_name, over, text, facts, priority, escalate, guardrail) => {
    const out = applyPolicy({ ...base, ...over } as ClassificationResult, text, facts);
    expect(out.priority).toBe(priority);
    expect(out.escalate).toBe(escalate);
    if (escalate) expect(out.escalateReason).toBeTruthy();
    else expect(out.escalateReason).toBeNull();
    if (guardrail) {
      expect(out.guardrails).toContain(guardrail);
      expect(out.policyNote).toMatch(/^ Policy: /);
      expect(out.rationale).toBe(`x${out.policyNote}`);
    } else {
      expect(out.guardrails).toEqual([]);
      expect(out.rationale).toBe("x");
    }
  });

  it("fills a reason when the model escalates without one, and drops a reason when it does not escalate", () => {
    expect(applyPolicy({ ...base, priority: "high", escalate: true }, TEXT).escalateReason).toMatch(/classifier/);
    expect(applyPolicy({ ...base, escalateReason: "stray" }, TEXT).escalateReason).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("rules fallback triage fields", () => {
  it("fills every field for the KB examples", () => {
    for (const e of KB_EXAMPLES) {
      const r = classifyByRules("", e.query);
      expect(r.category).toBe(e.category);
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.summary.length).toBeLessThanOrEqual(200);
      expect(r.nextAction.length).toBeLessThanOrEqual(160);
      expect(r.language).toBe("en");
    }
  });

  it.each([
    ["Can I update the description of my book on Amazon after it's already live?", "calm"],
    ["My royalty amount seems too low. Could you please check?", "concerned"],
    ["I am still waiting and nobody replies to my emails.", "frustrated"],
    ["THIS IS UNACCEPTABLE. WHERE IS MY MONEY", "angry"],
    ["You cheated me, worst publisher ever!!!", "angry"],
    ["This is the worst service. Pathetic.", "angry"],
  ])("sentiment of %j is %s", (text, sentiment) => {
    expect(rulesSentiment(text)).toBe(sentiment);
  });

  it.each([
    ["Mera royalty abhi tak nahi aaya, kab milega?", "hinglish"],
    ["मेरी रॉयल्टी अभी तक नहीं आई है", "hi"],
    ["My royalty has not arrived yet.", "en"],
    ["Mon livre n'est pas disponible sur Amazon.", "en"],
    ["Моя книга недоступна", "other"],
  ])("language of %j is %s", (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });

  it("summarises with the trimmed first sentence of the description", () => {
    const r = classifyByRules("Royalty", "  I have not received my Q2 royalty.   It was due in August. Please help. ");
    expect(r.summary).toBe("I have not received my Q2 royalty.");
    expect(r.nextAction).toMatch(/payout ledger/);
    expect(classifyByRules("Subject only here", "").summary).toBe("Subject only here");
    expect(classifyByRules("x", "a".repeat(400)).summary.length).toBeLessThanOrEqual(200);
  });

  it.each([
    ["I will file a case in consumer forum and contact my lawyer.", /Legal/],
    ["Not paid a single rupee in over a year, I have not received any royalty.", /year/],
    ["I will post about this on social media and leave a bad review.", /public/],
    ["This is the third time I am writing about my damaged copies.", /Repeated/],
    ["Someone else's personal data is printed in my author bio.", /privacy/],
  ])("escalates %j", (text, reason) => {
    const r = classifyByRules("", text);
    expect(r.escalate).toBe(true);
    expect(r.escalateReason).toMatch(reason);
  });

  it("does not escalate an ordinary ticket", () => {
    const r = classifyByRules("", "It's been 3 weeks and my book is still in typesetting. When will it be done?");
    expect(r).toMatchObject({ escalate: false, escalateReason: null });
  });

  it("an angry Hinglish royalty ticket with overdue facts ends up escalated after policy", () => {
    const text = "Mera royalty abhi tak nahi aaya!!! This is UNACCEPTABLE, worst service";
    const r = classifyByRules("Royalty kab milega", text);
    expect(r).toMatchObject({ category: "royalty_payments", sentiment: "angry", language: "hinglish" });
    const out = applyPolicy(r, text, overdue);
    expect(out.escalate).toBe(true);
    expect(out.escalateReason).toMatch(/overdue/);
    expect(out.guardrails).toContain("angry_overdue");
  });
});
