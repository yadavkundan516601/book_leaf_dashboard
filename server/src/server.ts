import { createApp } from "./app.js";
import { bootstrap } from "./bootstrap.js";

const ctx = await bootstrap();
const app = createApp(ctx);

const server = app.listen(ctx.env.PORT, () => {
  ctx.log.info(
    { port: ctx.env.PORT, db: ctx.dbHandle.driver, ai: ctx.ai.status.available() ? ctx.ai.status.models() : "degraded" },
    "BookLeaf support portal listening",
  );
});

// Pick up tickets whose classification didn't finish before the last shutdown.
ctx.ai.classification
  .recoverPending()
  .then((n) => n > 0 && ctx.log.info({ count: n }, "re-queued pending classifications"))
  .catch((err) => ctx.log.error({ err }, "pending classification recovery failed"));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  ctx.log.info({ signal }, "shutting down");
  const force = setTimeout(() => process.exit(1), 10_000).unref();
  server.close();
  server.closeAllConnections(); // SSE streams are long-lived
  await ctx.ai.classification.drain().catch(() => {});
  await ctx.dbHandle.close().catch(() => {});
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
