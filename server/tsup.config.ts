import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/db/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  splitting: true,
  // The shared workspace package ships TypeScript source, so it must be bundled.
  noExternal: ["@bookleaf/shared"],
});
