/**
 * GET /events - Server-Sent Events stream of ticket changes for the signed-in
 * user. Routing is decided here per subscriber (see bus.ts for the payload
 * contract): admins receive everything, authors only non-internal events
 * about their own tickets.
 */
import { Router } from "express";
import type { AppContext } from "../../context.js";
import { currentUser, type AuthUser } from "../../middleware/auth.js";
import type { RoutedEvent } from "./bus.js";

const HEARTBEAT_MS = 25_000;

export const canReceive = (user: AuthUser, e: RoutedEvent) =>
  user.role === "admin" || (!e.adminOnly && user.authorId !== null && e.authorId === user.authorId);

export function eventsRouter(ctx: AppContext): Router {
  const r = Router();

  r.get("/", (req, res) => {
    const user = currentUser(req);
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the stream.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 5000\n\n");
    res.write(`event: ready\ndata: ${JSON.stringify({ role: user.role })}\n\n`);

    const unsubscribe = ctx.bus.subscribe((e) => {
      if (canReceive(user, e)) res.write(`event: ${e.event.type}\ndata: ${JSON.stringify(e.event)}\n\n`);
    });
    // Comment frames keep idle connections alive through proxies and load balancers.
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return r;
}
