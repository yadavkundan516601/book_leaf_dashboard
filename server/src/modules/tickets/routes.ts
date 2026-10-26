import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import {
  createMessageSchema,
  createNoteSchema,
  createTicketSchema,
  generateDraftSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { currentUser, requireRole } from "../../middleware/auth.js";
import { parse } from "../../middleware/validate.js";
import { createTicketService } from "./service.js";

// Route-param typing is lost once a middleware precedes the handler; ids are validated by the service.
const ticketId = (req: Request): string => String(req.params.id);

export function ticketsRouter(ctx: AppContext): Router {
  const r = Router();
  const tickets = createTicketService(ctx);
  const adminOnly = requireRole("admin");

  // Keyed by user, not IP: authors behind one office NAT shouldn't throttle each other.
  const createLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: ctx.env.NODE_ENV === "test" ? 1000 : 10,
    keyGenerator: (req) => currentUser(req).id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: { code: "RATE_LIMITED", message: "You have raised a lot of tickets in the last hour. Please try again later." },
      }),
  });

  /** POST /tickets - authors raise a ticket about one of their books (or their account). */
  r.post("/", requireRole("author"), createLimiter, async (req, res) => {
    res.status(201).json(await tickets.create(currentUser(req), parse(createTicketSchema, req.body)));
  });

  /** GET /tickets - authors: their own tickets. Admins: the filterable, urgency-sorted queue. */
  r.get("/", async (req, res) => {
    res.json(await tickets.list(currentUser(req), parse(listTicketsQuerySchema, req.query)));
  });

  r.get("/:id", async (req, res) => {
    res.json(await tickets.get(currentUser(req), ticketId(req)));
  });

  r.patch("/:id", adminOnly, async (req, res) => {
    res.json(await tickets.update(currentUser(req), ticketId(req), parse(updateTicketSchema, req.body)));
  });

  r.post("/:id/messages", async (req, res) => {
    res.status(201).json(await tickets.addMessage(currentUser(req), ticketId(req), parse(createMessageSchema, req.body)));
  });

  r.post("/:id/notes", adminOnly, async (req, res) => {
    const { body } = parse(createNoteSchema, req.body);
    res.status(201).json(await tickets.addNote(currentUser(req), ticketId(req), body));
  });

  r.post("/:id/draft", adminOnly, async (req, res) => {
    const { regenerate } = parse(generateDraftSchema, req.body ?? {});
    res.json(await tickets.draft(currentUser(req), ticketId(req), regenerate));
  });

  r.post("/:id/reclassify", adminOnly, async (req, res) => {
    res.json(await tickets.reclassify(currentUser(req), ticketId(req)));
  });

  return r;
}
