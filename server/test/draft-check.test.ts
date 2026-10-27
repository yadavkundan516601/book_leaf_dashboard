import { describe, expect, it } from "vitest";
import { POLICY_DURATIONS, checkDraft, type DraftGrounding, type DraftWarning } from "@bookleaf/shared";

const G: DraftGrounding = {
  firstName: "Priya",
  amounts: [3570, 1000, 120000, 399, 35, 2546.5],
  dates: ["2026-11-14", "2025-10-15"],
  numbers: [342],
  allowedPhrases: [...POLICY_DURATIONS],
};

const SIGN = "Warm regards,\nBookLeaf Author Support";
const reply = (middle: string) => `Hi Priya,\n\n${middle}\n\n${SIGN}`;
const kinds = (ws: DraftWarning[]) => ws.map((w) => `${w.kind}:${w.text}`);

describe("checkDraft: amounts", () => {
  it("accepts grounded amounts in any equivalent format", () => {
    const body = reply(
      "You have ₹3,570 pending (Rs 3570, or Rs. 3,570.00, INR 3570, 3,570 rupees, 3570/-). The minimum is ₹1,000 and ₹1,20,000 is the target; ₹2,546.50 and ₹1.2 lakh too.",
    );
    expect(checkDraft(body, G).warnings.filter((w) => w.kind === "amount")).toEqual([]);
  });

  it("flags ungrounded amounts as high with exact offsets", () => {
    const body = reply("Your payout of ₹4,000, Rs. 3571 and ₹3.5k is on its way.");
    const amounts = checkDraft(body, G).warnings.filter((w) => w.kind === "amount");
    expect(amounts.map((w) => w.text)).toEqual(["₹4,000", "Rs. 3571", "₹3.5k"]);
    for (const w of amounts) {
      expect(w.severity).toBe("high");
      expect(body.slice(w.start, w.end)).toBe(w.text);
    }
    expect(amounts[0]!.message).toBe("₹4,000 isn't in this author's data");
  });

  it("handles Indian digit grouping and decimals", () => {
    const g = { ...G, amounts: [1234567.89] };
    expect(checkDraft(reply("Total ₹12,34,567.89 earned."), g).warnings).toEqual([]);
    expect(kinds(checkDraft(reply("Total ₹12,34,567.80 earned."), g).warnings)).toEqual(["amount:₹12,34,567.80"]);
  });
});

describe("checkDraft: dates", () => {
  it("accepts grounded dates in ISO, long, short and numeric formats", () => {
    const body = reply(
      "Due by 14 Nov 2026 (2026-11-14, November 14, 2026, Nov 14, 14th November, 14/11/2026). Last paid on 15 October 2025.",
    );
    expect(checkDraft(body, G).warnings).toEqual([]);
  });

  it("flags ungrounded dates as medium with exact offsets", () => {
    const body = reply("It will arrive by 20 Nov 2026 or on 2026-12-01 or Dec 3.");
    const ws = checkDraft(body, G).warnings;
    expect(kinds(ws)).toEqual(["date:20 Nov 2026", "date:2026-12-01", "date:Dec 3"]);
    for (const w of ws) {
      expect(w.severity).toBe("medium");
      expect(body.slice(w.start, w.end)).toBe(w.text);
    }
  });

  it("does not read ISBNs, month-year phrases or the verb 'may' as dates", () => {
    const body = reply("ISBN 978-93-5XXXX-01-1, published in July 2024. You may 2 times check.");
    expect(checkDraft(body, G).warnings).toEqual([]);
  });
});

describe("checkDraft: durations and percentages", () => {
  it("accepts allowed durations in equivalent spellings", () => {
    const body = reply(
      "Paid within 45 days. We will reply within 48 hours, re-sync in 24-48 hours (24 to 48 hrs), reprint in 5-7 working days, list in 7–10 business days, update in 3–5 business days.",
    );
    expect(checkDraft(body, G).warnings).toEqual([]);
  });

  it("flags durations the knowledge base does not support", () => {
    const body = reply("We will fix it within 24 hours, or in 3 weeks, or two business days.");
    const ws = checkDraft(body, G).warnings;
    expect(kinds(ws)).toEqual(["duration:24 hours", "duration:3 weeks", "duration:two business days"]);
    expect(ws.every((w) => w.severity === "medium" && body.slice(w.start, w.end) === w.text)).toBe(true);
  });

  it("allows only the 80/20 split", () => {
    const ws = checkDraft(reply("You get 80% and BookLeaf 20 percent; a 15% bonus applies."), G).warnings;
    expect(kinds(ws)).toEqual(["percent:15%"]);
  });
});

describe("checkDraft: format", () => {
  it("flags markdown and bullets as low", () => {
    const body = reply("**Update**\n## Status\n- first\n• second\n1. numbered is fine");
    const ws = checkDraft(body, G).warnings;
    expect(kinds(ws)).toEqual(["format:**", "format:**", "format:##", "format:-", "format:•"]);
    expect(ws.every((w) => w.severity === "low" && body.slice(w.start, w.end) === w.text)).toBe(true);
  });

  it("flags replies over 220 words, selecting the overflow", () => {
    const body = reply(Array.from({ length: 230 }, () => "word").join(" "));
    const { warnings, checklist } = checkDraft(body, G);
    const over = warnings.find((w) => w.kind === "format" && w.message.includes("words"));
    expect(over).toBeDefined();
    expect(body.slice(over!.start, over!.end)).toBe(over!.text);
    expect(checklist.find((c) => c.id === "length")!.passed).toBe(false);
  });
});

describe("checkDraft: checklist", () => {
  const passed = (body: string, g = G) => Object.fromEntries(checkDraft(body, g).checklist.map((c) => [c.id, c.passed]));

  it("passes a complete reply", () => {
    const body = reply(
      "Thank you for writing in, and I'm sorry for the worry. You have ₹3,570 pending.\n\nWe will escalate this and get back to you within 48 hours.",
    );
    expect(passed(body)).toEqual({ greeting: true, empathy: true, fact: true, next_step: true, sign_off: true, length: true });
  });

  it("reports each missing item with a hint", () => {
    const body = "Hello there,\n\nYour royalties are processed quarterly.\n\nThanks";
    const result = checkDraft(body, G);
    expect(Object.fromEntries(result.checklist.map((c) => [c.id, c.passed]))).toEqual({
      greeting: false,
      empathy: false,
      fact: false,
      next_step: false,
      sign_off: false,
      length: true,
    });
    expect(result.checklist.find((c) => c.id === "greeting")!.hint).toContain("Hi Priya,");
    expect(result.checklist.every((c) => c.label && c.hint)).toBe(true);
  });

  it("accepts a 'by <date>' timeline, a quoted title and a status as facts", () => {
    expect(passed(reply('I understand. "Whispers of the Ganges" is in Typesetting. Please reply by 14 Nov 2026.')).next_step).toBe(true);
    expect(passed(reply('I understand. "Whispers of the Ganges" is live. We will check.')).next_step).toBe(false);
    expect(passed(reply("I understand. It is at the Cover Design stage.")).fact).toBe(true);
    expect(passed(reply("I understand. You have sold 342 copies.")).fact).toBe(true);
  });

  it("tolerates CRLF and trailing spaces in the sign-off", () => {
    expect(passed("Hi Priya,\r\n\r\nThanks.\r\n\r\nWarm regards, \r\nBookLeaf Author Support  \r\n").sign_off).toBe(true);
  });
});

describe("checkDraft: robustness", () => {
  it("checks 5,000 adversarial characters in under 5 ms", () => {
    const inputs = [
      "₹1,".repeat(1700),
      "1".repeat(5000),
      "1,".repeat(2500),
      "12 Nov ".repeat(700),
      "5-7-".repeat(1250),
      "within 4 ".repeat(560),
      "**".repeat(2500),
      ("Thank you for writing in about ₹3,570 due by 14 Nov 2026 within 48 hours. ".repeat(70)).slice(0, 5000),
    ];
    for (const [i, input] of inputs.entries()) {
      // Best of 5 runs, so a GC pause or JIT warm-up doesn't decide the verdict; backtracking blow-ups are 100x slower.
      let best = Infinity;
      for (let run = 0; run < 5; run++) {
        const t0 = performance.now();
        checkDraft(input, G);
        best = Math.min(best, performance.now() - t0);
      }
      expect(best, `input ${i}`).toBeLessThan(5);
    }
  });
});
