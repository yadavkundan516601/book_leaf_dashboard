/** `npm run db:migrate` / `npm run db:seed` */
import { resolveDatabaseCa } from "./ssl.js";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createDb } from "./client.js";
import { seed } from "./seed.js";

const command = process.argv[2];
const env = loadEnv();
const log = createLogger(env.LOG_LEVEL, true);
const handle = await createDb({ databaseUrl: env.DATABASE_URL, sslCa: resolveDatabaseCa(env), pgliteDataDir: env.PGLITE_DATA_DIR });
try {
  if (command === "migrate" || command === "seed") await handle.migrate();
  if (command === "seed") {
    await seed(handle.db, {
      authorPassword: env.SEED_AUTHOR_PASSWORD,
      adminPassword: env.SEED_ADMIN_PASSWORD,
      demoHistory: env.SEED_DEMO_HISTORY,
      now: new Date(),
      log,
    });
  }
  if (command !== "migrate" && command !== "seed") throw new Error(`unknown command: ${command}`);
  log.info({ command, driver: handle.driver }, "done");
} finally {
  await handle.close();
}
