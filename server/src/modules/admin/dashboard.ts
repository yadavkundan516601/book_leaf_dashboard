/** Dashboard trends: 7-day volumes vs the previous 7 days, response times, workload per admin. */
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TICKET_CATEGORIES, type AdminDashboardDto, type DashboardAgentDto, type TicketCategory, type TrendDto } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { ticketMessages, tickets, users } from "../../db/schema.js";
import { addDays } from "../../lib/dates.js";
import { UNRESOLVED_STATUSES, slaBreachedSql } from "../tickets/repository.js";

const DAYS = 7;

/**
 * Window bounds as UTC midnights. The current window is the 7 calendar days ending today
 * (`start` .. `end`, end exclusive = tomorrow 00:00); `previousStart` begins the 7 days before it.
 */
export function dashboardWindow(now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    previousStart: addDays(end, -2 * DAYS),
    start: addDays(end, -DAYS),
    start30d: addDays(end, -30),
    end,
  };
}

/** Rows of (day index from `previousStart`, count) -> trend; indices 0-6 are the previous window, 7-13 the current. */
export function toTrend(rows: { day: number; n: number }[]): TrendDto {
  const days = new Array<number>(2 * DAYS).fill(0);
  for (const r of rows) if (r.day >= 0 && r.day < days.length) days[r.day]! += r.n;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const daily = days.slice(DAYS);
  return { total: sum(daily), previousTotal: sum(days.slice(0, DAYS)), daily };
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const inRange = (col: PgColumn, from: Date, to: Date) => and(gte(col, from), lt(col, to))!;

/** Whole UTC days between `from` (a UTC midnight) and `col`; independent of the session time zone. */
const dayIndex = (col: PgColumn, from: Date) =>
  sql<number>`floor(extract(epoch from (${col} - ${ts(from)})) / 86400)::int`.mapWith(Number);

/** Average of `to - from` in hours, 1 decimal; null when no row qualifies. */
const avgHours = (from: PgColumn, to: PgColumn, filter?: SQL) =>
  sql<number | null>`round((avg(extract(epoch from (${to} - ${from})))${filter ? sql` filter (where ${filter})` : sql``} / 3600)::numeric, 1)`.mapWith(
    (v: unknown) => (v === null ? null : Number(v)),
  );

export async function computeAdminDashboard(ctx: AppContext): Promise<AdminDashboardDto> {
  const { db } = ctx;
  const now = ctx.now();
  const w = dashboardWindow(now);
  const unresolved = inArray(tickets.status, UNRESOLVED_STATUSES);
  const adminReply = eq(ticketMessages.senderType, "admin");

  /** Per-day counts of `col` over both windows. Grouped by ordinal: the day expression carries a bound parameter. */
  const series = (table: typeof tickets | typeof ticketMessages, col: PgColumn, where?: SQL) =>
    db
      .select({ day: dayIndex(col, w.previousStart), n: count() })
      .from(table)
      .where(and(inRange(col, w.previousStart, w.end), where))
      .groupBy(sql`1`);

  const [createdRows, resolvedRows, replyRows, [firstResponse], [resolution], categoryRows, [attention], admins, agentTickets, agentReplies] =
    await Promise.all([
      series(tickets, tickets.createdAt),
      series(tickets, tickets.resolvedAt),
      series(ticketMessages, ticketMessages.createdAt, adminReply),
      db
        .select({
          value: avgHours(tickets.createdAt, tickets.firstRespondedAt, gte(tickets.createdAt, w.start)),
          previous: avgHours(tickets.createdAt, tickets.firstRespondedAt, lt(tickets.createdAt, w.start)),
        })
        .from(tickets)
        .where(and(inRange(tickets.createdAt, w.previousStart, w.end), isNotNull(tickets.firstRespondedAt))),
      db
        .select({
          value: avgHours(tickets.createdAt, tickets.resolvedAt, gte(tickets.resolvedAt, w.start)),
          previous: avgHours(tickets.createdAt, tickets.resolvedAt, lt(tickets.resolvedAt, w.start)),
        })
        .from(tickets)
        .where(inRange(tickets.resolvedAt, w.previousStart, w.end)),
      db.select({ category: tickets.category, n: count() }).from(tickets).where(unresolved).groupBy(tickets.category),
      db
        .select({
          slaBreached: sql<number>`count(*) filter (where ${slaBreachedSql(now)})`.mapWith(Number),
          unassignedUrgent: sql<number>`count(*) filter (where ${and(
            unresolved,
            isNull(tickets.assigneeId),
            inArray(tickets.priority, ["critical", "high"]),
          )})`.mapWith(Number),
          awaitingFirstReply: sql<number>`count(*) filter (where ${and(unresolved, isNull(tickets.firstRespondedAt))})`.mapWith(Number),
        })
        .from(tickets),
      db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.name)),
      db
        .select({
          id: tickets.assigneeId,
          resolved7d: sql<number>`count(*) filter (where ${inRange(tickets.resolvedAt, w.start, w.end)})`.mapWith(Number),
          resolved30d: sql<number>`count(*) filter (where ${inRange(tickets.resolvedAt, w.start30d, w.end)})`.mapWith(Number),
          avgFirstResponseHours: avgHours(tickets.createdAt, tickets.firstRespondedAt, inRange(tickets.firstRespondedAt, w.start30d, w.end)),
        })
        .from(tickets)
        .where(isNotNull(tickets.assigneeId))
        .groupBy(tickets.assigneeId),
      db
        .select({
          id: ticketMessages.senderId,
          replies7d: sql<number>`count(*) filter (where ${gte(ticketMessages.createdAt, w.start)})`.mapWith(Number),
          replies30d: count(),
        })
        .from(ticketMessages)
        .where(and(adminReply, inRange(ticketMessages.createdAt, w.start30d, w.end)))
        .groupBy(ticketMessages.senderId),
    ]);

  const byCategory = new Map<TicketCategory | null, number>(categoryRows.map((r) => [r.category, r.n]));
  const ticketsBy = new Map(agentTickets.map((r) => [r.id, r]));
  const repliesBy = new Map(agentReplies.map((r) => [r.id, r]));

  const agents: DashboardAgentDto[] = admins
    .map((a) => ({
      id: a.id,
      name: a.name,
      resolved7d: ticketsBy.get(a.id)?.resolved7d ?? 0,
      resolved30d: ticketsBy.get(a.id)?.resolved30d ?? 0,
      replies7d: repliesBy.get(a.id)?.replies7d ?? 0,
      replies30d: repliesBy.get(a.id)?.replies30d ?? 0,
      avgFirstResponseHours: ticketsBy.get(a.id)?.avgFirstResponseHours ?? null,
    }))
    .sort((a, b) => b.resolved7d - a.resolved7d || b.resolved30d - a.resolved30d || a.name.localeCompare(b.name));

  return {
    generatedAt: now.toISOString(),
    created: toTrend(createdRows),
    resolved: toTrend(resolvedRows),
    replies: toTrend(replyRows),
    avgFirstResponseHours: { value: firstResponse?.value ?? null, previous: firstResponse?.previous ?? null },
    avgResolutionHours: { value: resolution?.value ?? null, previous: resolution?.previous ?? null },
    unresolvedByCategory: [...TICKET_CATEGORIES, null].map((category) => ({ category, count: byCategory.get(category) ?? 0 })),
    agents,
    attention: {
      slaBreached: attention?.slaBreached ?? 0,
      unassignedUrgent: attention?.unassignedUrgent ?? 0,
      awaitingFirstReply: attention?.awaitingFirstReply ?? 0,
    },
  };
}
