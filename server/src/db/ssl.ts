/**
 * Strict TLS for managed Postgres (Aiven, RDS ...): verify the server certificate against the provider's
 * CA instead of just encrypting. The CA comes from the environment, either inline or as a file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PoolConfig } from "pg";
import type { Env } from "../config/env.js";

/** The CA certificate text (PEM) from DATABASE_SSL_CA or DATABASE_SSL_CA_FILE, or undefined when neither is set. */
export function resolveDatabaseCa(env: Pick<Env, "DATABASE_SSL_CA" | "DATABASE_SSL_CA_FILE">, cwd = process.cwd()): string | undefined {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim();
  if (!env.DATABASE_SSL_CA_FILE) return undefined;
  const file = path.resolve(cwd, env.DATABASE_SSL_CA_FILE);
  if (!existsSync(file)) {
    throw new Error(`DATABASE_SSL_CA_FILE points to a file that does not exist: ${file}`);
  }
  return readFileSync(file, "utf8").trim();
}

/**
 * Pool settings for a connection string. With a CA, TLS is verified against it and the `sslmode` hints in the
 * URL are dropped: node-postgres lets URL parameters override an explicit `ssl` option, which would silently
 * turn verification back off (or on, against the wrong store).
 */
export function buildPoolConfig(databaseUrl: string, ca?: string): PoolConfig {
  if (!ca) return { connectionString: databaseUrl };
  const url = new URL(databaseUrl);
  for (const key of ["sslmode", "uselibpqcompat", "sslrootcert", "sslcert", "sslkey"]) url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
