import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "*.audit.ts",
  outputDir: "artifacts/product-audit/browser-results",
  reporter: [["list"], ["json", { outputFile: "artifacts/product-audit/browser.json" }]],
});
