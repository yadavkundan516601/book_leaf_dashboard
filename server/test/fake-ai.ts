/** Deterministic in-memory AI layer so ticket tests never touch the network. */
import { eq } from "drizzle-orm";
import { EMPTY_DRAFT_GROUNDING, type GenerateDraftOptions } from "@bookleaf/shared";
import type { AiLayer } from "../src/ai/index.js";
import type { BootstrapOptions } from "../src/bootstrap.js";
import { tickets } from "../src/db/schema.js";
import { FIXED_NOW } from "./helpers.js";

export interface FakeAi {
  enqueued: string[];
  reclassified: string[];
  drafted: { ticketId: string; regenerate: boolean }[];
  /** Every draft request as the route passed it. */
  draftRequests: ({ ticketId: string } & GenerateDraftOptions)[];
  factory: NonNullable<BootstrapOptions["ai"]>;
}

export function fakeAi(): FakeAi {
  const fake: FakeAi = {
    enqueued: [],
    reclassified: [],
    drafted: [],
    draftRequests: [],
    factory: (base): AiLayer => ({
      classification: {
        enqueue: (id) => void fake.enqueued.push(id),
        recoverPending: async () => 0,
        reclassify: async (id) => {
          fake.reclassified.push(id);
          await base.db
            .update(tickets)
            .set({
              classificationState: "completed",
              suggestedCategory: "royalty_payments",
              suggestedPriority: "high",
              category: "royalty_payments",
              categorySource: "ai",
              priority: "high",
              prioritySource: "ai",
              classificationConfidence: 0.9,
              classificationRationale: "fake",
              classifiedAt: FIXED_NOW,
            })
            .where(eq(tickets.id, id));
        },
        drain: async () => {},
      },
      drafts: {
        getDraft: async (ticketId, opts) => {
          fake.drafted.push({ ticketId, regenerate: opts.regenerate });
          // The tickets route passes the whole parsed request body (instruction, baseDraft, ...).
          fake.draftRequests.push({ ticketId, ...(opts as GenerateDraftOptions) });
          return {
            grounding: EMPTY_DRAFT_GROUNDING,
            warnings: [],
            checklist: [],
            ticketId,
            body: "Hi, thanks for reaching out.",
            source: "ai",
            model: "claude-haiku-4-5",
            notice: null,
            kbSections: ["royalty"],
            createdAt: FIXED_NOW.toISOString(),
            cached: false,
          };
        },
      },
      status: { available: () => true, models: () => ({ classify: "claude-haiku-4-5", draft: "claude-haiku-4-5" }) },
    }),
  };
  return fake;
}

/** A clock that advances one second per read, so rows written in sequence sort deterministically. */
export function tickingClock(start = FIXED_NOW): () => Date {
  let n = 0;
  return () => new Date(start.getTime() + n++ * 1000);
}
