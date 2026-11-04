import { defineConfig } from "vitest/config";

export default defineConfig({ test: {
  include: ["tests/audit/**/*.audit.ts"],
  fileParallelism: false,
  testTimeout: 30000,
  hookTimeout: 180000,
  reporters: ["default", "json"],
  outputFile: { json: "../../artifacts/product-audit/api.json" }
} });
