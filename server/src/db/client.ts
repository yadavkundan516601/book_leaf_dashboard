/**
 * Database connection factory.
 *
 * Production uses node-postgres against DATABASE_URL. When DATABASE_URL is not
 * set (local dev, tests, reviewers without Postgres installed) we fall back to
 * PGlite: real Postgres compiled to WASM and run in-process, so the same SQL,
 * enums, arrays and migrations apply. Both drivers expose the same Drizzle
 * query API; we type the handle as the node-postgres flavour.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  driver: "postgres" | "pglite";
  migrate(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

/** Migrations live in server/drizzle: ../../drizzle from src/db (tsx), ../drizzle from dist (bundle). */
function resolveMigrationsFolder(): string {
  const candidates = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle")];
  const found = candidates.find((c) => existsSync(path.join(c, "meta", "_journal.json")));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(", ")})`);
  return found;
}

export interface DbOptions {
  databaseUrl?: string;
  pgliteDataDir: string;
}

export async function createDb(opts: DbOptions): Promise<DbHandle> {
  const folder = resolveMigrationsFolder();

  if (opts.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: opts.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    const db = drizzlePg(pool, { schema });
    return {
      db,
      driver: "postgres",
      migrate: () => migratePg(db, { migrationsFolder: folder }),
      ping: async () => {
        await pool.query("select 1");
      },
      close: () => pool.end(),
    };
  }

  const inMemory = opts.pgliteDataDir === "memory";
  if (!inMemory) mkdirSync(opts.pgliteDataDir, { recursive: true });
  const client = inMemory ? new PGlite() : new PGlite(opts.pgliteDataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Db,
    driver: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder: folder }),
    ping: async () => {
      await client.query("select 1");
    },
    close: () => client.close(),
  };
}
