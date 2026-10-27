import { createApp } from "./app.js";
import { checkGeminiModels } from "./ai/gemini-provider.js";
import { bootstrap } from "./bootstrap.js";

const ctx = await bootstrap();
const app = createApp(ctx);

const server = app.listen(ctx.env.PORT, () => {
  ctx.log.info(
    { port: ctx.env.PORT, db: ctx.dbHandle.driver, ai: ctx.ai.status.available() ? ctx.ai.status.models() : "degraded" },
    "BookLeaf support portal listening",
  );
});

// Diagnostic only: log which Gemini model candidates this key can use (fallback still resolves on first call).
if (ctx.ai.status.provider() === "gemini" && ctx.env.GEMINI_API_KEY && !ctx.env.AI_DISABLED) {
  void checkGeminiModels(ctx.env.GEMINI_API_KEY, [ctx.env.AI_CLASSIFY_MODEL, ctx.env.AI_DRAFT_MODEL], ctx.log);
}

// Pick up tickets whose classification didn't finish before the last shutdown.
ctx.ai.classification
  .recoverPending()
  .then((n) => n > 0 && ctx.log.info({ count: n }, "re-queued pending classifications"))
  .catch((err) => ctx.log.error({ err }, "pending classification recovery failed"));

// Periodic sweep: retries classifications that failed on a transient DB error (capped by attempts).
const recoveryTimer = setInterval(() => {
  ctx.ai.classification.recoverPending().catch((err) => ctx.log.error({ err }, "pending classification sweep failed"));
}, 60_000);
recoveryTimer.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  ctx.log.info({ signal }, "shutting down");
  const force = setTimeout(() => process.exit(1), 10_000).unref();
  clearInterval(recoveryTimer);
  server.close();
  server.closeAllConnections(); // SSE streams are long-lived
  await ctx.ai.classification.drain().catch(() => {});
  await ctx.dbHandle.close().catch(() => {});
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
