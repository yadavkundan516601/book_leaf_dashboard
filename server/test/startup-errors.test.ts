import { describe, expect, it } from "vitest";
import { describeDatabaseTarget, explainStartupError } from "../src/lib/startup-errors.js";

const URL_WITH_SECRETS = "postgres://admin:hunter2@pg-demo.l.aivencloud.com:19156/defaultdb?sslmode=require";
/** Drizzle wraps the driver error: DrizzleQueryError { cause: Error { code } }. */
const wrapped = (code: string, message = code) => Object.assign(new Error("Failed query: CREATE SCHEMA"), { cause: Object.assign(new Error(message), { code }) });

describe("startup error explanations", () => {
  it("explains an unresolvable database host without leaking credentials", () => {
    const text = explainStartupError(wrapped("ENOTFOUND", "getaddrinfo ENOTFOUND pg-demo.l.aivencloud.com"), URL_WITH_SECRETS)!;
    expect(text).toContain("pg-demo.l.aivencloud.com:19156/defaultdb");
    expect(text).toMatch(/powered off|deleted/i);
    expect(text).not.toMatch(/hunter2|admin:/);
  });

  it.each([
    ["ECONNREFUSED", /refused the connection/],
    ["ETIMEDOUT", /did not answer in time/],
    ["28P01", /username or password/],
    ["3D000", /database name .* does not exist/],
  ])("recognises %s", (code, pattern) => {
    expect(explainStartupError(wrapped(code), URL_WITH_SECRETS)).toMatch(pattern);
  });

  it("recognises an untrusted TLS certificate and suggests the fix", () => {
    const text = explainStartupError(new Error("self-signed certificate in certificate chain"), URL_WITH_SECRETS)!;
    expect(text).toContain("uselibpqcompat=true&sslmode=require");
  });

  it("explains a missing CA certificate file", () => {
    const text = explainStartupError(new Error('DATABASE_SSL_CA_FILE="certs/aiven-ca.pem" was not found. Looked in: /app/certs/aiven-ca.pem.'))!;
    expect(text).toContain("aiven-ca.pem");
    expect(text).toMatch(/repository root/);
  });

  it("returns null for anything else so the full stack trace is kept", () => {
    expect(explainStartupError(new Error("something unexpected"))).toBeNull();
  });

  it("describes the target as host:port/db only", () => {
    expect(describeDatabaseTarget(URL_WITH_SECRETS)).toBe("pg-demo.l.aivencloud.com:19156/defaultdb");
    expect(describeDatabaseTarget("not a url")).toBeNull();
    expect(describeDatabaseTarget(undefined)).toBeNull();
  });
});
