import { defineConfig } from "vitest/config";

export default defineConfig({ test: {
  include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  fileParallelism: false,
  testTimeout: 30000,
  hookTimeout: 180000
} });
