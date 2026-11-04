import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.CASEFLOW_E2E_CONTROL_TOKEN ||= randomUUID();

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: "list",
  outputDir: "artifacts/e2e-results",
  globalTeardown: "./tests/e2e/teardown.mts",
  use: { baseURL: "http://127.0.0.1:5188", channel: process.env.E2E_BROWSER_CHANNEL || "chrome", viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure", trace: "off" },
  webServer: { command: "npx tsx tests/e2e/server.mts", url: "http://127.0.0.1:5188/api/health", timeout: 180000, reuseExistingServer: false, ...(process.platform === "win32" ? {} : { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 15000 } }) }
});
