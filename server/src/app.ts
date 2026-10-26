/**
 * Express application factory. Pure wiring: no I/O happens here, so tests can
 * build an app around an in-memory database and a fake AI layer.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import type { AppContext } from "./context.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/routes.js";
import { authorsRouter } from "./modules/authors/routes.js";
import { booksRouter } from "./modules/books/routes.js";
import { mountApiDocs } from "./modules/docs/routes.js";
import { eventsRouter } from "./modules/events/routes.js";
import { ticketsRouter } from "./modules/tickets/routes.js";
import { adminRouter } from "./modules/admin/routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable("x-powered-by");
  if (ctx.env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(
    pinoHttp({
      logger: ctx.log,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // swagger-ui needs inline styles; scripts stay same-origin only.
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:"],
        },
      },
    }),
  );
  if (ctx.env.CORS_ORIGIN) {
    const origin = ctx.env.CORS_ORIGIN;
    app.use((req, res, next) => {
      if (req.headers.origin === origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
        res.setHeader("Vary", "Origin");
      }
      if (req.method === "OPTIONS") return void res.status(204).end();
      next();
    });
  }
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // Public endpoints
  app.get("/api/v1/health", async (_req, res) => {
    try {
      await ctx.dbHandle.ping();
      res.json({ status: "ok", db: ctx.dbHandle.driver, ai: ctx.ai.status.available() ? "available" : "degraded" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  mountApiDocs(app);

  const v1 = Router();
  v1.use("/auth", authRouter(ctx));

  // Everything below requires a valid session.
  const authed = Router();
  authed.use(authenticate(ctx.jwtSecret));
  authed.use("/books", booksRouter(ctx));
  authed.use("/authors", authorsRouter(ctx));
  authed.use("/tickets", ticketsRouter(ctx));
  authed.use("/events", eventsRouter(ctx));
  authed.use("/admin", adminRouter(ctx));
  v1.use(authed);

  app.use("/api/v1", v1);
  app.use("/api", notFoundHandler);

  // Serve the built SPA from the same origin (cookie auth, no CORS needed).
  const webDist = [path.resolve(here, "../../web/dist"), path.resolve(here, "../web/dist")].find((p) => existsSync(p));
  if (ctx.env.SERVE_WEB && webDist) {
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  app.use(notFoundHandler);
  app.use(errorHandler(ctx.log));
  return app;
}
