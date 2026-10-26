/**
 * API documentation: the hand-written OpenAPI 3.1 spec (server/openapi.yaml)
 * as JSON at /api/openapi.json and rendered with Swagger UI at /api/docs.
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

const here = path.dirname(fileURLToPath(import.meta.url));

/** openapi.yaml lives in server/: ../../../ from src/modules/docs (tsx), ../ from dist (bundle). */
function loadSpec(): Record<string, unknown> {
  const candidates = [path.resolve(here, "../../../openapi.yaml"), path.resolve(here, "../openapi.yaml")];
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error(`openapi.yaml not found (looked in ${candidates.join(", ")})`);
  return parseYaml(readFileSync(found, "utf8")) as Record<string, unknown>;
}

export function mountApiDocs(app: Express): void {
  const spec = loadSpec();
  app.get("/api/openapi.json", (_req, res) => res.json(spec));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: "BookLeaf Support API" }));
}
