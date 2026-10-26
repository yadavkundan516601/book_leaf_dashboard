import { describe, expect, it } from "vitest";
import { PRIORITY_RANK } from "@bookleaf/shared";
import { KB_EXAMPLES } from "../src/ai/knowledge-base.js";
import { applyPolicy } from "../src/ai/policy.js";
import { matchesKeyword, retrieveKb } from "../src/ai/retrieval.js";
import { classifyByRules } from "../src/ai/rules-classifier.js";

describe("rules classifier", () => {
  it.each(KB_EXAMPLES.map((e) => [e.category, e.query] as const))("classifies the KB example as %s", (category, query) => {
    expect(classifyByRules("", query).category).toBe(category);
  });

  it("ranks a long-missing royalty above a bio update, with capped confidence", () => {
    const royalty = classifyByRules("Royalty", "I haven't received any royalty for 6 months");
    const bio = classifyByRules("Bio", "Can I update my author bio?");
    expect(PRIORITY_RANK[royalty.priority]).toBeGreaterThan(PRIORITY_RANK[bio.priority]);
    expect(royalty.confidence).toBeLessThanOrEqual(0.5);
    expect(royalty.rationale).toMatch(/^Rule-based fallback \(AI unavailable\): matched 'royalt'/);
  });
});

describe("policy", () => {
  it("raises ISBN errors to at least high and legal threats to critical", () => {
    const base = { category: "isbn_metadata" as const, priority: "low" as const, confidence: 0.9, rationale: "x" };
    expect(applyPolicy(base, "The ISBN on Amazon is different from my copy").priority).toBe("high");
    expect(applyPolicy({ ...base, category: "royalty_payments" }, "I will contact my lawyer").priority).toBe("critical");
    expect(applyPolicy({ ...base, priority: "medium" }, "What is an ISBN?").priority).toBe("medium");
  });
});

describe("retrieval", () => {
  it("matches keywords at word starts only", () => {
    expect(matchesKeyword("My royalty is late", "royalt")).toBe(true);
    expect(matchesKeyword("within 48 hours", "rs")).toBe(false);
    expect(matchesKeyword("only ₹3,000", "₹")).toBe(true);
  });

  it("gives a royalty ticket the royalty section and royalty examples only", () => {
    const r = retrieveKb(
      "royalty_payments",
      "No royalty received since my book launched. My dashboard shows sales, so I don't understand why nothing has been paid.",
    );
    expect(r.sectionIds).toContain("royalty");
    expect(r.sectionIds).not.toContain("printing");
    expect(r.sectionIds).not.toContain("isbn");
    expect(r.sectionIds.length).toBeLessThanOrEqual(3);
    expect(r.examples.length).toBeGreaterThan(0);
    expect(r.examples.every((e) => e.category === "royalty_payments")).toBe(true);
  });
});
