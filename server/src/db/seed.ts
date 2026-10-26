/**
 * Idempotent seed: loads the provided dataset (10 authors, 18 books), creates
 * one login per author plus two admin accounts, and adds a handful of demo
 * tickets on a fresh database so the queue isn't empty on first open. With
 * `demoHistory`, a fresh database also gets ~4 weeks of already-handled
 * tickets (deterministic, relative to `now`) so the admin dashboard has trends.
 *
 * Re-running is safe: users are created only if missing (passwords are never
 * reset), books/authors are upserted from the dataset (it is the source of
 * truth for catalog and royalty figures), and demo tickets are only inserted
 * when the tickets table is empty.
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ClassificationSource, TicketCategory, TicketPriority, TicketStatus } from "@bookleaf/shared";
import rawDataset from "../../../data/bookleaf_sample_data.json" with { type: "json" };
import type { Logger } from "../lib/logger.js";
import type { Db } from "./client.js";
import { authors, books, ticketEvents, ticketMessages, tickets, users } from "./schema.js";

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

interface HistoryTemplate {
  subject: string;
  /** `{book}` is replaced by the book title, or "my book" for account-level tickets. */
  description: string;
  reply: string;
}

const HISTORY_TEMPLATES: Record<TicketCategory, HistoryTemplate[]> = {
  royalty_payments: [
    {
      subject: "Royalty not received for last quarter",
      description: "The quarterly royalty for {book} has not reached my bank account yet. The dashboard shows it as pending. Could you check the payout status?",
      reply: "Thanks for flagging this. The payout for last quarter was processed this week and should reach your account within 3 business days. We have attached the statement to your profile.",
    },
    {
      subject: "Royalty amount looks lower than expected",
      description: "My royalty statement for {book} shows fewer copies than the sales I can see on Amazon. Can you share the breakdown by platform?",
      reply: "We have shared the platform-wise breakdown. Some marketplace sales are reported a month late, so they will appear in the next quarterly statement.",
    },
    {
      subject: "Need to update bank details for royalty payouts",
      description: "I have changed banks and want my future royalty payments to go to the new account. What do you need from me?",
      reply: "We have updated your payout account after verifying the cancelled cheque. The next payout will go to the new account.",
    },
    {
      subject: "TDS deducted on my royalty payment",
      description: "TDS was deducted from my latest royalty payment for {book}. Where can I get the certificate for my tax filing?",
      reply: "The Form 16A for the quarter has been emailed to you. You can also download it from the royalties page.",
    },
  ],
  distribution_availability: [
    {
      subject: "Book shows unavailable on Amazon",
      description: "{book} shows 'Currently Unavailable' on Amazon India since a few days. Readers are asking me where to buy it.",
      reply: "The listing was paused during a stock sync. We have restored it and the book is orderable again.",
    },
    {
      subject: "Not listed on Flipkart yet",
      description: "It has been more than two weeks since {book} went live, but I can't find it on Flipkart. Is something pending?",
      reply: "The Flipkart listing went live today. New listings can take up to 3 weeks to appear in search.",
    },
    {
      subject: "Kindle edition missing",
      description: "The paperback of {book} is on Amazon but there is no Kindle edition. Can we publish the ebook as well?",
      reply: "The Kindle edition has been submitted and should be live within 72 hours. It will be linked to the paperback automatically.",
    },
  ],
  isbn_metadata: [
    {
      subject: "ISBN mismatch between listing and print",
      description: "The ISBN on the online listing for {book} does not match the one printed on the back cover. Which one is correct?",
      reply: "The printed ISBN is correct. We have corrected the listing metadata; the change shows on retailer sites within a few days.",
    },
    {
      subject: "Wrong author name spelling on the listing",
      description: "My name is misspelt on the listing for {book}. Please correct it everywhere.",
      reply: "We have corrected the contributor name on all platforms. Some retailers refresh metadata weekly, so it may take a few days.",
    },
  ],
  printing_quality: [
    {
      subject: "Blurry print in author copies",
      description: "Several pages in my author copies of {book} are blurry and the cover colours look faded. Can these be replaced?",
      reply: "Sorry about that. We traced it to one print batch and have dispatched replacement copies at no cost.",
    },
    {
      subject: "Pages out of order in a reader's copy",
      description: "A reader sent me photos of a copy of {book} with pages 40 to 56 out of order. How do we get them a replacement?",
      reply: "We have arranged a replacement for the reader and flagged the batch with the print partner.",
    },
  ],
  book_status_production: [
    {
      subject: "Cover design still waiting",
      description: "My manuscript was approved weeks ago but {book} is still at the cover design stage. When will I see the first draft?",
      reply: "The first cover concepts are ready and have been shared with you. Once you pick one, typesetting starts the same week.",
    },
    {
      subject: "When will typesetting be done?",
      description: "Could you share the expected date for the typeset proof of {book}? I'd like to plan the launch.",
      reply: "The typeset proof will be with you by the end of this week. Publication usually follows 2-3 weeks after proof approval.",
    },
  ],
  general_inquiry: [
    {
      subject: "Update author bio",
      description: "I'd like to update my author bio on all book pages to mention my new award. How do I send it?",
      reply: "Thanks! We have updated your bio across platforms. It can take 3-5 business days to show everywhere.",
    },
    {
      subject: "How do I order more author copies?",
      description: "I want 50 more copies of {book} for a book fair. What is the author price and delivery time?",
      reply: "Author copies are available at the printing cost plus shipping. We have emailed you a quote; delivery takes 7-10 days.",
    },
  ],
};

/** 17 slots weighted roughly 35/20/12/12/12/9, stepped through with a stride so neighbours differ. */
const HISTORY_CATEGORY_CYCLE: TicketCategory[] = [
  "royalty_payments", "distribution_availability", "isbn_metadata", "royalty_payments", "printing_quality",
  "book_status_production", "royalty_payments", "distribution_availability", "general_inquiry", "royalty_payments",
  "isbn_metadata", "distribution_availability", "royalty_payments", "printing_quality", "book_status_production",
  "royalty_payments", "general_inquiry",
];

const HISTORY_PRIORITIES: Record<TicketCategory, TicketPriority[]> = {
  royalty_payments: ["high", "medium", "high", "critical", "medium"],
  distribution_availability: ["high", "critical", "medium"],
  isbn_metadata: ["medium", "high", "medium"],
  printing_quality: ["medium", "low", "high"],
  book_status_production: ["medium", "low"],
  general_inquiry: ["low", "low", "medium"],
};

/** A plausible different suggestion, for tickets where an admin overrode the classifier. */
const CATEGORY_ALTERNATIVE: Record<TicketCategory, TicketCategory> = {
  royalty_payments: "general_inquiry",
  distribution_availability: "isbn_metadata",
  isbn_metadata: "distribution_availability",
  printing_quality: "book_status_production",
  book_status_production: "general_inquiry",
  general_inquiry: "royalty_payments",
};
const PRIORITY_ALTERNATIVE: Record<TicketPriority, TicketPriority> = { critical: "high", high: "medium", medium: "high", low: "medium" };

const HISTORY_TICKETS = 34;
const HISTORY_DAYS = 28;

export async function seed(
  db: Db,
  opts: {
    authorPassword: string;
    adminPassword: string;
    log: Logger;
    /** Clock for demo ticket timestamps. */
    now?: Date;
    /** Add ~4 weeks of handled demo tickets on a fresh database. */
    demoHistory?: boolean;
  },
) {
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
    const now = (opts.now ?? new Date()).getTime();
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

    if (opts.demoHistory ?? true) await seedDemoHistory(tx, data, new Date(now));
  });

  opts.log.info({ authors: data.authors.length, books: data.authors.reduce((n, a) => n + a.books.length, 0) }, "seed complete");
}

type SeedTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * ~34 handled tickets spread over the 28 days before `now`, inserted oldest
 * first after the demo tickets. Every value is derived from the ticket's index
 * so repeated seeds produce the same history.
 */
async function seedDemoHistory(tx: SeedTx, data: Dataset, now: Date) {
  const admins = await tx.select({ id: users.id, email: users.email }).from(users).where(sql`${users.role} = 'admin'`);
  const adminIds = SEED_ADMINS.map((a) => admins.find((x) => x.email === a.email)?.id).filter((id): id is string => !!id);
  if (adminIds.length === 0) return;
  const authorRows = await tx.select({ id: authors.id, userId: authors.userId }).from(authors);
  const authorUser = new Map(authorRows.map((a) => [a.id, a.userId]));

  const hours = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);
  const templateUse = new Map<TicketCategory, number>();

  for (let i = 0; i < HISTORY_TICKETS; i++) {
    const author = data.authors[(i * 3) % data.authors.length]!;
    const authorUserId = authorUser.get(author.author_id);
    if (!authorUserId) continue;
    const category = HISTORY_CATEGORY_CYCLE[(i * 5) % HISTORY_CATEGORY_CYCLE.length]!;
    const book = category === "general_inquiry" || i % 6 === 5 ? null : author.books[i % author.books.length]!;
    const templates = HISTORY_TEMPLATES[category];
    const use = templateUse.get(category) ?? 0;
    templateUse.set(category, use + 1);
    const template = templates[(use + i) % templates.length]!;
    const priorities = HISTORY_PRIORITIES[category];
    const priority = priorities[i % priorities.length]!;

    // Oldest first: index 0 is ~28 days old, the last one ~2 days old.
    const ageHours = 40 + Math.floor(((HISTORY_TICKETS - 1 - i) * (HISTORY_DAYS * 24 - 52)) / (HISTORY_TICKETS - 1)) + ((i * 5) % 7);
    const createdAt = hours(now, -ageHours);
    const classifiedAt = hours(createdAt, 0.02);
    const firstResponseHours = 1 + ((i * 7) % 30);
    const firstRespondedAt = hours(createdAt, firstResponseHours);
    const resolvedCandidate = hours(createdAt, Math.max(4 + ((i * 13) % 117), firstResponseHours + 2));
    const closedCandidate = hours(resolvedCandidate, 48);

    let status: TicketStatus;
    if (i % 7 === 3 || resolvedCandidate > now) status = "in_progress";
    else if (i % 3 === 0 && closedCandidate <= now) status = "closed";
    else status = "resolved";
    const resolvedAt = status === "in_progress" ? null : resolvedCandidate;

    const classifier: ClassificationSource = i % 5 === 2 ? "rules" : "ai";
    const overrideCategory = i % 11 === 5;
    const overridePriority = i % 9 === 4;
    const suggestedCategory = overrideCategory ? CATEGORY_ALTERNATIVE[category] : category;
    const suggestedPriority = overridePriority ? PRIORITY_ALTERNATIVE[priority] : priority;
    const assigneeId = adminIds[(i % 5 < 3 ? 0 : 1) % adminIds.length]!;

    const [ticket] = await tx
      .insert(tickets)
      .values({
        authorId: author.author_id,
        bookId: book?.book_id ?? null,
        subject: template.subject,
        description: template.description.replaceAll("{book}", book ? book.title : "my book"),
        status,
        category,
        categorySource: overrideCategory ? "admin" : classifier,
        priority,
        prioritySource: overridePriority ? "admin" : classifier,
        classificationState: "completed",
        suggestedCategory,
        suggestedPriority,
        classificationConfidence: 0.55 + ((i * 37) % 41) / 100,
        classificationRationale: `Reads as a ${suggestedCategory.replaceAll("_", " ")} question.`,
        classificationAttempts: 1,
        classifiedAt,
        assigneeId,
        firstRespondedAt,
        resolvedAt,
        createdAt,
        updatedAt: status === "closed" ? closedCandidate : (resolvedAt ?? firstRespondedAt),
      })
      .returning({ id: tickets.id });
    const ticketId = ticket!.id;

    await tx.insert(ticketMessages).values({
      ticketId,
      senderType: "admin",
      senderId: assigneeId,
      body: template.reply,
      usedAiDraft: (i * 3) % 5 < 3,
      createdAt: firstRespondedAt,
    });

    const events: (typeof ticketEvents.$inferInsert)[] = [
      { ticketId, actorId: authorUserId, type: "created", createdAt },
      { ticketId, actorId: null, type: "classified", toValue: `${suggestedCategory}/${suggestedPriority} via ${classifier}`, createdAt: classifiedAt },
      { ticketId, actorId: assigneeId, type: "status_changed", fromValue: "open", toValue: "in_progress", createdAt: firstRespondedAt },
    ];
    if (resolvedAt) {
      events.push({ ticketId, actorId: assigneeId, type: "status_changed", fromValue: "in_progress", toValue: "resolved", createdAt: resolvedAt });
    }
    if (status === "closed") {
      events.push({ ticketId, actorId: assigneeId, type: "status_changed", fromValue: "resolved", toValue: "closed", createdAt: closedCandidate });
    }
    await tx.insert(ticketEvents).values(events);
  }
}
