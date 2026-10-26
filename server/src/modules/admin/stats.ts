/** Dashboard aggregates: queue health, SLA, and AI cost/quality over the last 24h. */
import { and, count, eq, gte, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { TICKET_PRIORITIES, TICKET_STATUSES, type AdminStatsDto, type TicketPriority, type TicketStatus } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { aiCalls, ticketMessages, tickets } from "../../db/schema.js";
import { estimateCostUsd } from "../../ai/index.js";
import { UNRESOLVED_STATUSES, slaBreachedSql } from "../tickets/repository.js";

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Share (0..1, 3 places) of rows matching `cond`, optionally among rows matching `among`; null when none qualify. */
const share = (cond: SQL, among?: SQL) =>
  sql<number | null>`round(avg(case when ${cond} then 1.0 else 0.0 end)${among ? sql` filter (where ${among})` : sql``}, 3)`.mapWith(
    (v: unknown) => (v === null ? null : Number(v)),
  );

export async function computeAdminStats(ctx: AppContext): Promise<AdminStatsDto> {
  const { db } = ctx;
  const now = ctx.now();
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const unresolved = inArray(tickets.status, UNRESOLVED_STATUSES);

  const [statusRows, priorityRows, [queue], aiRows, [agreement], [drafts]] = await Promise.all([
    db.select({ status: tickets.status, n: count() }).from(tickets).groupBy(tickets.status),
    db
      .select({ priority: tickets.priority, n: count() })
      .from(tickets)
      .where(and(unresolved, isNotNull(tickets.priority)))
      .groupBy(tickets.priority),
    db
      .select({
        unassignedOpen: sql<number>`count(*) filter (where ${unresolved} and ${isNull(tickets.assigneeId)})`.mapWith(Number),
        slaBreached: sql<number>`count(*) filter (where ${slaBreachedSql(now)})`.mapWith(Number),
      })
      .from(tickets),
    db
      .select({
        model: aiCalls.model,
        calls: count(),
        failures: sql<number>`count(*) filter (where ${ne(aiCalls.outcome, "success")})`.mapWith(Number),
        inputTokens: sql<number>`coalesce(sum(${aiCalls.inputTokens}), 0)`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${aiCalls.outputTokens}), 0)`.mapWith(Number),
        cacheReadTokens: sql<number>`coalesce(sum(${aiCalls.cacheReadTokens}), 0)`.mapWith(Number),
        cacheWriteTokens: sql<number>`coalesce(sum(${aiCalls.cacheWriteTokens}), 0)`.mapWith(Number),
      })
      .from(aiCalls)
      .where(gte(aiCalls.createdAt, since))
      .groupBy(aiCalls.model),
    db
      .select({
        category: share(sql`${tickets.category} = ${tickets.suggestedCategory}`),
        // A classified ticket may lack a suggested priority; those don't count against agreement.
        priority: share(sql`${tickets.priority} = ${tickets.suggestedPriority}`, isNotNull(tickets.suggestedPriority)),
      })
      .from(tickets)
      .where(and(eq(tickets.classificationState, "completed"), isNotNull(tickets.suggestedCategory))),
    db
      .select({ rate: share(sql`${ticketMessages.usedAiDraft}`) })
      .from(ticketMessages)
      .where(eq(ticketMessages.senderType, "admin")),
  ]);

  const byStatus = zeros<TicketStatus>(TICKET_STATUSES);
  for (const r of statusRows) byStatus[r.status] = r.n;
  const openByPriority = zeros<TicketPriority>(TICKET_PRIORITIES);
  for (const r of priorityRows) if (r.priority) openByPriority[r.priority] = r.n;

  const sum = (f: (r: (typeof aiRows)[number]) => number) => aiRows.reduce((n, r) => n + f(r), 0);
  const cost = sum((r) => estimateCostUsd(r.model, r));
  const available = ctx.ai.status.available();

  return {
    byStatus,
    openByPriority,
    unassignedOpen: queue?.unassignedOpen ?? 0,
    slaBreached: queue?.slaBreached ?? 0,
    ai: {
      available,
      model: available ? ctx.ai.status.models().classify : null,
      calls24h: sum((r) => r.calls),
      failures24h: sum((r) => r.failures),
      inputTokens24h: sum((r) => r.inputTokens),
      outputTokens24h: sum((r) => r.outputTokens),
      estimatedCostUsd24h: Math.round(cost * 1_000_000) / 1_000_000,
      categoryAgreement: agreement?.category ?? null,
      priorityAgreement: agreement?.priority ?? null,
      draftUsageRate: drafts?.rate ?? null,
    },
  };
}
