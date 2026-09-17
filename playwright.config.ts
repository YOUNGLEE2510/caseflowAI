import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: "list",
  outputDir: "artifacts/e2e-results",
  use: { baseURL: "http://127.0.0.1:5188", channel: process.env.E2E_BROWSER_CHANNEL || "chrome", viewport: { width: 1440, height: 1000 }, screenshot: "only-on-failure", trace: "off" },
  webServer: { command: "npx tsx tests/e2e/server.mts", url: "http://127.0.0.1:5188/api/health", timeout: 180000, reuseExistingServer: false, gracefulShutdown: { signal: "SIGTERM", timeout: 10000 } }
});
