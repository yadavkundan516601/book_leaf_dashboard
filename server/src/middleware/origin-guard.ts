import type { RequestHandler } from "express";
import { forbidden } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: browsers attach an
 * Origin header to every cross-origin state-changing request, so reject
 * unsafe methods whose Origin is neither this host nor the configured
 * CORS origin. Requests without an Origin (curl, server-to-server) pass;
 * they can't ride a victim's browser cookies.
 */
export function originGuard(allowedOrigin?: string): RequestHandler {
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin) return next();
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return next(forbidden("Cross-origin request rejected"));
    }
    if (host === req.headers.host || origin === allowedOrigin) return next();
    next(forbidden("Cross-origin request rejected"));
  };
}
