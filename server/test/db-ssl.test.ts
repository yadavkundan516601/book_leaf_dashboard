import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPoolConfig, resolveDatabaseCa } from "../src/db/ssl.js";

const PEM = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";
const URL_ = "postgres://user:p%40ss@db.example.com:19156/app?sslmode=require&uselibpqcompat=true&application_name=bookleaf";

describe("database TLS", () => {
  it("without a CA leaves the connection string untouched", () => {
    expect(buildPoolConfig(URL_)).toEqual({ connectionString: URL_ });
  });

  it("with a CA verifies against it and drops the sslmode hints that would override it", () => {
    const cfg = buildPoolConfig(URL_, PEM);
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    const url = new URL(cfg.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("uselibpqcompat")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("bookleaf"); // other parameters survive
    expect(decodeURIComponent(url.password)).toBe("p@ss"); // credentials survive, still encoded
  });

  it("reads the CA inline (with escaped newlines) or from a file, and fails clearly on a missing file", () => {
    expect(resolveDatabaseCa({ DATABASE_SSL_CA: "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----" })).toBe(PEM);
    const dir = mkdtempSync(path.join(tmpdir(), "ca-"));
    writeFileSync(path.join(dir, "ca.pem"), `${PEM}\n`);
    expect(resolveDatabaseCa({ DATABASE_SSL_CA_FILE: "ca.pem" }, dir)).toBe(PEM);
    expect(resolveDatabaseCa({})).toBeUndefined();
    expect(() => resolveDatabaseCa({ DATABASE_SSL_CA_FILE: "nope.pem" }, dir)).toThrow(/does not exist/);
  });
});
