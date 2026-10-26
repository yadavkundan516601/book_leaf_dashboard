import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { AdminRefDto } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { users } from "../../db/schema.js";
import { requireRole } from "../../middleware/auth.js";
import { computeAdminDashboard } from "./dashboard.js";
import { computeAdminStats } from "./stats.js";

export function adminRouter(ctx: AppContext): Router {
  const r = Router();
  r.use(requireRole("admin"));

  /** GET /admin/team - BookLeaf staff, for assignment dropdowns and the "assignee" filter. */
  r.get("/team", async (_req, res) => {
    const data: AdminRefDto[] = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.name));
    res.json({ data });
  });

  /** GET /admin/stats - queue health, SLA and AI usage for the dashboard header. */
  r.get("/stats", async (_req, res) => {
    res.json(await computeAdminStats(ctx));
  });

  /** GET /admin/dashboard - 7-day trends vs the previous week, response times and per-admin workload. */
  r.get("/dashboard", async (_req, res) => {
    res.json(await computeAdminDashboard(ctx));
  });

  return r;
}
