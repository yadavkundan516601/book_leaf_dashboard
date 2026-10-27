/**
 * Turns the failures people actually hit on first start (a database that can't be reached, bad credentials,
 * TLS trust) into a short, actionable message instead of a raw stack trace. Never includes credentials.
 */

interface ErrorLike {
  code?: string;
  message?: string;
  cause?: unknown;
}

/** The first error in the cause chain that carries a code, falling back to the outermost error. */
function rootCause(err: unknown): ErrorLike {
  let cur = err as ErrorLike | undefined;
  let found: ErrorLike | undefined;
  for (let i = 0; cur && i < 6; i++) {
    if (cur.code && !found) found = cur;
    cur = cur.cause as ErrorLike | undefined;
  }
  return found ?? (err as ErrorLike) ?? {};
}

/** "host:port/db" from a connection string, or null. User and password are never read out. */
export function describeDatabaseTarget(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return null;
  }
}

/** A multi-line explanation for the error, or null when it isn't one we recognise (print the stack then). */
export function explainStartupError(err: unknown, databaseUrl?: string): string | null {
  const cause = rootCause(err);
  const text = `${cause.message ?? ""} ${(err as ErrorLike)?.message ?? ""}`;
  const target = describeDatabaseTarget(databaseUrl);
  const where = target ? ` (${target})` : "";

  switch (cause.code) {
    case "ENOTFOUND":
      return [
        `Cannot find the database host${where}: its name does not exist in DNS.`,
        "Most likely the database service is powered off or deleted (free tiers pause when idle), or DATABASE_URL was copied incompletely.",
        "Fix: open your database provider's console, make sure the service is running, and copy a fresh connection URL into DATABASE_URL.",
      ].join("\n");
    case "ECONNREFUSED":
      return [
        `The database${where} refused the connection.`,
        "Fix: check that the server is running and that the host and port in DATABASE_URL are right.",
      ].join("\n");
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return [
        `The database${where} did not answer in time.`,
        "Fix: check your network or VPN, and that your provider allows connections from your IP address (allow-list).",
      ].join("\n");
    case "28P01":
      return "The database rejected the username or password in DATABASE_URL. Fix: copy the current credentials from your provider.";
    case "3D000":
      return `The database name in DATABASE_URL does not exist${where}. Fix: create it, or use the name your provider gives you.`;
  }
  if (/self[- ]signed|unable to verify the first certificate|certificate/i.test(text)) {
    return [
      `The database's TLS certificate is not trusted by this machine${where}.`,
      "Managed databases such as Aiven use their own certificate authority. Fix: add `uselibpqcompat=true&sslmode=require` to DATABASE_URL (encrypted, without verifying the issuer), or provide your provider's CA certificate.",
    ].join("\n");
  }
  if (/SSL|TLS/i.test(text) && /does not support|required/i.test(text)) {
    return "The database requires (or refuses) an encrypted connection. Fix: add or remove `sslmode=require` in DATABASE_URL to match your provider.";
  }
  return null;
}
