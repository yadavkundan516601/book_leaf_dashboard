/**
 * Idempotent seed: loads the provided dataset (10 authors, 18 books), creates
 * one login per author plus two admin accounts, and adds a handful of demo
 * tickets on a fresh database so the queue isn't empty on first open.
 *
 * Re-running is safe: users are created only if missing (passwords are never
 * reset), books/authors are upserted from the dataset (it is the source of
 * truth for catalog and royalty figures), and demo tickets are only inserted
 * when the tickets table is empty.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { z } from "zod";
import rawDataset from "../../../data/bookleaf_sample_data.json" with { type: "json" };
import type { Logger } from "../lib/logger.js";
import type { Db } from "./client.js";
import { authors, books, ticketMessages, tickets, users } from "./schema.js";

const isoDate = z.iso.date();

const bookSchema = z.object({
  book_id: z.string(),
  title: z.string(),
  isbn: z.string().nullable(),
  genre: z.string().nullable(),
  publication_date: isoDate.nullable(),
  status: z.string(),
  mrp: z.number().nullable(),
  author_royalty_per_copy: z.number().nullable(),
  total_copies_sold: z.number().int(),
  total_royalty_earned: z.number(),
  royalty_paid: z.number(),
  royalty_pending: z.number(),
  last_royalty_payout_date: isoDate.nullable(),
  print_partner: z.string().nullable(),
  available_on: z.array(z.string()),
});

const datasetSchema = z.object({
  authors: z.array(
    z.object({
      author_id: z.string(),
      name: z.string(),
      email: z.string().email(),
      phone: z.string().nullable(),
      city: z.string().nullable(),
      joined_date: isoDate.nullable(),
      books: z.array(bookSchema),
    }),
  ),
});

export type Dataset = z.infer<typeof datasetSchema>;

export const SEED_ADMINS = [
  { email: "admin@bookleaf.test", name: "Ananya Ops" },
  { email: "support@bookleaf.test", name: "Rahul Support" },
] as const;

/** Flags figures that don't reconcile so bad source data is visible, not silently trusted. */
function auditDataset(data: Dataset, log: Logger) {
  for (const a of data.authors) {
    for (const b of a.books) {
      if (b.total_royalty_earned - b.royalty_paid !== b.royalty_pending) {
        log.warn({ bookId: b.book_id }, "dataset: royalty_pending != earned - paid");
      }
      if (b.author_royalty_per_copy !== null && b.author_royalty_per_copy * b.total_copies_sold !== b.total_royalty_earned) {
        log.warn({ bookId: b.book_id }, "dataset: royalty_per_copy * copies != earned");
      }
    }
  }
}

interface DemoTicket {
  authorId: string;
  bookId: string | null;
  subject: string;
  description: string;
  hoursAgo: number;
  reply?: { body: string; status: "in_progress" | "resolved"; hoursAgo: number };
}

const DEMO_TICKETS: DemoTicket[] = [
  {
    authorId: "AUTH003",
    bookId: "BK005",
    subject: "No royalty received since my book launched",
    description:
      "My book Between Two Temples was published in July 2024 and I have not received a single royalty payment so far. My dashboard shows sales, so I don't understand why nothing has been paid. Please explain what is going on.",
    hoursAgo: 30,
  },
  {
    authorId: "AUTH002",
    bookId: "BK003",
    subject: "Different ISBN on Amazon vs my printed copy",
    description:
      "The ISBN shown on the Amazon listing for Code & Karma does not match the ISBN printed on the back cover of my author copies. Readers are confused and I'm worried sales are being attributed to the wrong book.",
    hoursAgo: 6,
  },
  {
    authorId: "AUTH010",
    bookId: "BK018",
    subject: "Howrah Nights showing 'Currently Unavailable' on Amazon",
    description:
      "My book Howrah Nights is published but Amazon India shows it as Currently Unavailable since last week. I'm running a promotion this weekend, can you please check urgently?",
    hoursAgo: 52,
  },
  {
    authorId: "AUTH007",
    bookId: "BK013",
    subject: "When will Midnight in Mysore be ready?",
    description:
      "It has been three weeks and my book Midnight in Mysore is still at the cover design stage. Is there anything pending from my side? I'd like to know the expected publication timeline.",
    hoursAgo: 75,
  },
  {
    authorId: "AUTH004",
    bookId: null,
    subject: "Can I update my author bio?",
    description:
      "I'd like to update the author bio that appears on my book pages to mention my new podcast. How can I do that and how long does it take to reflect?",
    hoursAgo: 96,
    reply: {
      body:
        "Hi Vikram,\n\nThanks for reaching out, and congratulations on the podcast! You can send us your updated bio by replying here or by email, and we'll submit it to all platforms. Changes typically reflect within 3–5 business days.\n\nWarm regards,\nBookLeaf Author Support",
      status: "resolved",
      hoursAgo: 90,
    },
  },
];

export async function seed(db: Db, opts: { authorPassword: string; adminPassword: string; log: Logger }) {
  const data = datasetSchema.parse(rawDataset);
  auditDataset(data, opts.log);

  const [authorHash, adminHash] = await Promise.all([
    bcrypt.hash(opts.authorPassword, 10),
    bcrypt.hash(opts.adminPassword, 10),
  ]);

  await db.transaction(async (tx) => {
    for (const admin of SEED_ADMINS) {
      await tx
        .insert(users)
        .values({ email: admin.email, name: admin.name, role: "admin", passwordHash: adminHash })
        .onConflictDoNothing();
    }

    for (const a of data.authors) {
      const email = a.email.toLowerCase();
      await tx
        .insert(users)
        .values({ email, name: a.name, role: "author", passwordHash: authorHash })
        .onConflictDoNothing();
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      if (!user) throw new Error(`seed: user for ${email} missing after insert`);

      const authorRow = {
        id: a.author_id,
        userId: user.id,
        name: a.name,
        email,
        phone: a.phone,
        city: a.city,
        joinedDate: a.joined_date,
      };
      await tx
        .insert(authors)
        .values(authorRow)
        .onConflictDoUpdate({ target: authors.id, set: { ...authorRow, id: undefined } });

      for (const b of a.books) {
        const bookRow = {
          id: b.book_id,
          authorId: a.author_id,
          title: b.title,
          isbn: b.isbn,
          genre: b.genre,
          publicationDate: b.publication_date,
          status: b.status,
          mrp: b.mrp,
          royaltyPerCopy: b.author_royalty_per_copy,
          totalCopiesSold: b.total_copies_sold,
          totalRoyaltyEarned: b.total_royalty_earned,
          royaltyPaid: b.royalty_paid,
          royaltyPending: b.royalty_pending,
          lastRoyaltyPayoutDate: b.last_royalty_payout_date,
          printPartner: b.print_partner,
          availableOn: b.available_on,
        };
        await tx
          .insert(books)
          .values(bookRow)
          .onConflictDoUpdate({ target: books.id, set: { ...bookRow, id: undefined, updatedAt: new Date() } });
      }
    }

    const [{ count } = { count: 0 }] = await tx.select({ count: sql<number>`count(*)::int` }).from(tickets);
    if (count > 0) return;

    const [admin] = await tx.select({ id: users.id }).from(users).where(sql`${users.email} = ${SEED_ADMINS[0].email}`);
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3_600_000);

    for (const t of DEMO_TICKETS) {
      const [author] = await tx.select({ id: authors.id }).from(authors).where(sql`${authors.id} = ${t.authorId}`);
      if (!author) continue;
      const createdAt = hoursAgo(t.hoursAgo);
      // Inserted as "pending" on purpose: the classification worker's startup
      // sweep picks them up exactly like tickets created through the API.
      const [ticket] = await tx
        .insert(tickets)
        .values({
          authorId: t.authorId,
          bookId: t.bookId,
          subject: t.subject,
          description: t.description,
          createdAt,
          updatedAt: createdAt,
        })
        .returning({ id: tickets.id });
      if (t.reply && admin) {
        const repliedAt = hoursAgo(t.reply.hoursAgo);
        await tx.insert(ticketMessages).values({
          ticketId: ticket!.id,
          senderType: "admin",
          senderId: admin.id,
          body: t.reply.body,
          createdAt: repliedAt,
        });
        await tx
          .update(tickets)
          .set({
            status: t.reply.status,
            firstRespondedAt: repliedAt,
            resolvedAt: t.reply.status === "resolved" ? repliedAt : null,
            assigneeId: admin.id,
            updatedAt: repliedAt,
          })
          .where(sql`${tickets.id} = ${ticket!.id}`);
      }
    }
  });

  opts.log.info({ authors: data.authors.length, books: data.authors.reduce((n, a) => n + a.books.length, 0) }, "seed complete");
}
