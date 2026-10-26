/**
 * Session auth: a signed JWT in an httpOnly, SameSite=Lax cookie.
 *
 * Why a cookie rather than a bearer token in localStorage: the token is not
 * readable by page scripts (XSS can't exfiltrate it) and EventSource (SSE)
 * sends cookies automatically but cannot set an Authorization header. A
 * Bearer header is still accepted for API clients (Postman, scripts).
 *
 * CSRF: SameSite=Lax keeps the cookie off cross-site POST/PATCH requests, and
 * originGuard rejects state-changing requests from foreign origins.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@bookleaf/shared";
import { forbidden, unauthorized } from "../lib/errors.js";

export const SESSION_COOKIE = "bl_session";

export interface AuthUser {
  id: string;
  role: Role;
  /** Present for authors; scopes every author query. */
  authorId: string | null;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenClaims {
  sub: string;
  role: Role;
  aid: string | null;
  name: string;
  email: string;
}

export function signSession(user: AuthUser, secret: string, ttlHours: number): string {
  const claims: TokenClaims = { sub: user.id, role: user.role, aid: user.authorId, name: user.name, email: user.email };
  return jwt.sign(claims, secret, { expiresIn: Math.round(ttlHours * 3600), algorithm: "HS256" });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
}

export function authenticate(secret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) return next(unauthorized());
    try {
      const claims = jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenClaims;
      req.user = { id: claims.sub, role: claims.role, authorId: claims.aid, name: claims.name, email: claims.email };
      next();
    } catch {
      next(unauthorized("Session expired or invalid. Please sign in again."));
    }
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

/** Narrowing helper for handlers mounted behind `authenticate`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
