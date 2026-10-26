/**
 * Knowledge-base retrieval: each draft prompt carries only the KB sections
 * relevant to the ticket (by category, then by keyword hits), never the whole
 * KB. With 7 short sections an embedding index would be overkill; keyword +
 * category routing is deterministic, free and explainable (section ids are
 * returned and shown to the admin as `kbSections`).
 */
import type { TicketCategory } from "@bookleaf/shared";
import { KB_EXAMPLES, KB_SECTIONS, type KbExample, type KbSection } from "./knowledge-base.js";

export const MAX_KB_SECTIONS = 3;
export const MAX_KB_EXAMPLES = 2;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const reCache = new Map<string, RegExp>();

/**
 * Case-insensitive match anchored at a word start; trailing text is allowed,
 * so "royalt" matches "royalty" and "print" matches "printing", but "rs"
 * never matches inside "hours". Keywords that start with a symbol (₹) match
 * anywhere. Spaces in phrases match any whitespace.
 */
export function matchesKeyword(text: string, keyword: string): boolean {
  let re = reCache.get(keyword);
  if (!re) {
    const body = keyword.trim().split(/\s+/).map(escapeRe).join("\\s+");
    const anchored = /^[\p{L}\p{N}]/u.test(keyword) ? `(?<![\\p{L}\\p{N}_])${body}` : body;
    re = new RegExp(anchored, "iu");
    reCache.set(keyword, re);
  }
  return re.test(text);
}

export interface Retrieved {
  sections: KbSection[];
  examples: KbExample[];
  sectionIds: string[];
}

export function retrieveKb(category: TicketCategory, text: string): Retrieved {
  const byCategory = KB_SECTIONS.filter((s) => s.categories.includes(category));
  const byKeyword = KB_SECTIONS.filter((s) => !byCategory.includes(s))
    .map((s, order) => ({ s, order, hits: s.keywords.filter((k) => matchesKeyword(text, k)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.order - b.order)
    .map((x) => x.s);
  const sections = [...byCategory, ...byKeyword].slice(0, MAX_KB_SECTIONS);
  const examples = KB_EXAMPLES.filter((e) => e.category === category).slice(0, MAX_KB_EXAMPLES);
  return { sections, examples, sectionIds: sections.map((s) => s.id) };
}
