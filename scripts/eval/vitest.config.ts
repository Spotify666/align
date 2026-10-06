import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Offline probes over exported tracks (PROBE_DIR=<outDir of run.mjs>); not part of `npm test`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  test: { include: ["scripts/eval/**/*.probe.ts"], environment: "node", testTimeout: 300000 },
});
