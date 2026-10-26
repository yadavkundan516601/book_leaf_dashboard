import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { loginSchema, type UserDto } from "@bookleaf/shared";
import type { AppContext } from "../../context.js";
import { authors, users } from "../../db/schema.js";
import { unauthorized } from "../../lib/errors.js";
import { SESSION_COOKIE, authenticate, currentUser, signSession, type AuthUser } from "../../middleware/auth.js";
import { parse } from "../../middleware/validate.js";

// Defence against user enumeration by timing: unknown emails still pay for one bcrypt compare.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export function authRouter(ctx: AppContext): Router {
  const r = Router();
  const secure = ctx.env.NODE_ENV === "production";

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: ctx.env.NODE_ENV === "test" ? 1000 : 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again in a few minutes." } }),
  });

  r.post("/login", loginLimiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const [row] = await ctx.db
      .select({ user: users, authorId: authors.id })
      .from(users)
      .leftJoin(authors, eq(authors.userId, users.id))
      .where(sql`lower(${users.email}) = ${input.email}`);

    const ok = await bcrypt.compare(input.password, row?.user.passwordHash ?? DUMMY_HASH);
    if (!row || !ok) throw unauthorized("Incorrect email or password");

    const user: AuthUser = {
      id: row.user.id,
      role: row.user.role,
      authorId: row.authorId,
      name: row.user.name,
      email: row.user.email,
    };
    const token = signSession(user, ctx.jwtSecret, ctx.env.JWT_TTL_HOURS);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: ctx.env.JWT_TTL_HOURS * 3_600_000,
      path: "/",
    });
    // The token is only delivered as an httpOnly cookie, never in the body where page scripts could read it.
    const body: { user: UserDto } = { user: toUserDto(user) };
    res.json(body);
  });

  r.post("/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure, path: "/" });
    res.status(204).end();
  });

  r.get("/me", authenticate(ctx.jwtSecret), (req, res) => {
    res.json({ user: toUserDto(currentUser(req)) });
  });

  return r;
}

const toUserDto = (u: AuthUser): UserDto => ({ id: u.id, email: u.email, name: u.name, role: u.role, authorId: u.authorId });
