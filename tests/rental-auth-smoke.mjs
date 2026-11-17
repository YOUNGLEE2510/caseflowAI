import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const setup = JSON.parse(await readFile("artifacts/rental-setup/credentials.json", "utf8"));
const base = "http://localhost:8080";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
await mkdir("artifacts/rental-setup", { recursive: true });
try {
  for (const prefix of ["manager@", "technician@", "resident@"]) {
    const account = setup.credentials.find(item => item.email.startsWith(prefix));
    assert(account, `Missing demo role: ${prefix}`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => {
      if (response.url().includes("/api/") && response.status() >= 500) errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);
    });
    await page.goto(base + "/login");
    await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption(setup.organization);
    await page.getByLabel("Email tài khoản", { exact: true }).fill(account.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL("**/overview", { timeout: 30000 });
    const routes = prefix === "resident@" ? ["/overview", "/cases", "/cases/new", "/knowledge", "/profile"] : ["/overview", "/cases", "/incidents", "/rental", "/knowledge", "/profile"];
    for (const route of routes) {
      await page.goto(base + route);
      await page.locator(".app-frame main h1").first().waitFor({ timeout: 45000 });
      await page.locator("main .spinner").first().waitFor({ state: "hidden", timeout: 45000 });
      assert.equal(await page.locator("main [role=alert]").count(), 0, `Page error: ${prefix} ${route}`);
      assert(!page.url().includes("/login"), `Unexpected logout: ${prefix} ${route}`);
      assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `Overflow: ${prefix} ${route}`);
    }
    await page.goto(base + "/overview");
    await page.locator(".app-frame main h1").first().waitFor({ timeout: 45000 });
    await page.locator("main .spinner").first().waitFor({ state: "hidden", timeout: 45000 });
    const role = prefix.slice(0, -1);
    await page.screenshot({ path: `artifacts/rental-setup/auth-${role}.png`, fullPage: true, animations: "disabled", timeout: 90000 });
    await page.setViewportSize({ width: 375, height: 900 });
    await page.waitForTimeout(500);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `Mobile overflow: ${role}`);
    await page.screenshot({ path: `artifacts/rental-setup/auth-${role}-mobile.png`, fullPage: true, animations: "disabled", timeout: 90000 });
    assert.deepEqual(errors, [], `Browser/server errors: ${role}`);
    results.push({ role, login: "passed", routes, mobileOverflow: false, errors });
    console.log(`${role}: login and ${routes.length} routes passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile("artifacts/rental-setup/auth-smoke.json", JSON.stringify(results, null, 2));
