import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { MyBooksResponse } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { books } from "../../db/schema.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { currentUser } from "../../middleware/auth.js";
import { summarizeRoyalty, toBookDto } from "./mappers.js";

export function booksRouter(ctx: AppContext): Router {
  const r = Router();

  /** GET /books - authors: their own catalog + royalty summary. Admins: all books (optionally ?authorId=). */
  r.get("/", async (req, res) => {
    const user = currentUser(req);
    const authorId = user.role === "author" ? user.authorId : typeof req.query.authorId === "string" ? req.query.authorId : undefined;
    if (user.role === "author" && !authorId) throw forbidden();

    const rows = await ctx.db
      .select()
      .from(books)
      .where(authorId ? eq(books.authorId, authorId) : undefined)
      .orderBy(asc(books.authorId), asc(books.id));

    const body: MyBooksResponse = { books: rows.map(toBookDto), royalty: summarizeRoyalty(rows, ctx.now()) };
    res.json(body);
  });

  /** GET /books/:id - authors may only read their own book (404 otherwise, to avoid id probing). */
  r.get("/:id", async (req, res) => {
    const user = currentUser(req);
    const [row] = await ctx.db.select().from(books).where(eq(books.id, req.params.id));
    if (!row || (user.role === "author" && row.authorId !== user.authorId)) throw notFound("Book");
    res.json(toBookDto(row));
  });

  return r;
}

