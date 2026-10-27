/**
 * Strict TLS for managed Postgres (Aiven, RDS ...): verify the server certificate against the provider's
 * CA instead of just encrypting. The CA comes from the environment, either inline or as a file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PoolConfig } from "pg";
import type { Env } from "../config/env.js";

/** The monorepo root: the nearest parent of `from` whose package.json declares workspaces. */
function findRepoRoot(from: string): string | null {
  let dir = path.resolve(from);
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, "utf8")) as { workspaces?: unknown }).workspaces) return dir;
      } catch {
        /* unreadable package.json: keep walking up */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Where a configured CA file may live: as given (absolute), next to where the server runs, or at the repository
 * root. The root is what makes a path like `aiven-ca.pem` work the same locally (server runs from server/) and in
 * the Docker image (server runs from /app, the root).
 */
export function caFileCandidates(file: string, cwd: string): string[] {
  if (path.isAbsolute(file)) return [file];
  const root = findRepoRoot(cwd);
  return [...new Set([path.resolve(cwd, file), ...(root ? [path.resolve(root, file)] : [])])];
}

/** The CA certificate text (PEM) from DATABASE_SSL_CA or DATABASE_SSL_CA_FILE, or undefined when neither is set. */
export function resolveDatabaseCa(env: Pick<Env, "DATABASE_SSL_CA" | "DATABASE_SSL_CA_FILE">, cwd = process.cwd()): string | undefined {
  if (env.DATABASE_SSL_CA) return env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim();
  if (!env.DATABASE_SSL_CA_FILE) return undefined;
  const candidates = caFileCandidates(env.DATABASE_SSL_CA_FILE, cwd);
  const file = candidates.find((c) => existsSync(c));
  if (!file) {
    throw new Error(
      `DATABASE_SSL_CA_FILE="${env.DATABASE_SSL_CA_FILE}" was not found. Looked in: ${candidates.join(", ")}. ` +
        "Commit the certificate at the repository root (aiven-ca.pem) or set DATABASE_SSL_CA to its text.",
    );
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
