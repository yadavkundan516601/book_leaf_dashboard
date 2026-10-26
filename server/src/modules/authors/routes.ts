import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { AppContext } from "../../context.js";
import { authors, books } from "../../db/schema.js";
import { notFound } from "../../lib/errors.js";
import { requireRole } from "../../middleware/auth.js";
import { summarizeRoyalty, toAuthorDto, toBookDto } from "../books/mappers.js";

/** Admin-only author directory (used by the queue's author filter and ticket side panel). */
export function authorsRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole("admin"));

  r.get("/", async (_req, res) => {
    const rows = await ctx.db.select().from(authors).orderBy(asc(authors.name));
    res.json({ data: rows.map(toAuthorDto) });
  });

  r.get("/:id", async (req, res) => {
    const [row] = await ctx.db.select().from(authors).where(eq(authors.id, req.params.id));
    if (!row) throw notFound("Author");
    const bookRows = await ctx.db.select().from(books).where(eq(books.authorId, row.id)).orderBy(asc(books.id));
    res.json({ ...toAuthorDto(row), books: bookRows.map(toBookDto), royalty: summarizeRoyalty(bookRows, ctx.now()) });
  });

  return r;
}
