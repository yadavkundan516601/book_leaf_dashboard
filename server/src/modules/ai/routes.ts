import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { answerRequestSchema } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { forbidden } from "../../lib/errors.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { parse } from "../../middleware/validate.js";

export interface AiRouterOptions {
  /** Instant answers per author per window (default 8 per 10 minutes; effectively unlimited under NODE_ENV=test). */
  answerRateLimit?: { limit: number; windowMs: number };
}

export function aiRouter(ctx: AppContext, opts: AiRouterOptions = {}): Router {
  const r = Router();
  const limits = opts.answerRateLimit ?? { limit: ctx.env.NODE_ENV === "test" ? 1000 : 8, windowMs: 10 * 60_000 };

  // Keyed by user, not IP (as for ticket creation): each answer may cost an LLM call.
  const answerLimiter = rateLimit({
    windowMs: limits.windowMs,
    limit: limits.limit,
    keyGenerator: (req) => currentUser(req).id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "You've asked a lot of questions in a short time. You can still send your query.",
        },
      }),
  });

  /** POST /ai/answer - authors: a short grounded answer before raising a ticket. */
  r.post("/answer", requireRole("author"), answerLimiter, async (req, res) => {
    const user = currentUser(req);
    if (!user.authorId) throw forbidden();
    const input = parse(answerRequestSchema, req.body);
    res.json(await ctx.ai.answers.answer({ userId: user.id, authorId: user.authorId }, input));
  });

  return r;
}
