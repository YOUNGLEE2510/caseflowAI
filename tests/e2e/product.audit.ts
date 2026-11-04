import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("U01: CSAT no-data text fits in at most two desktop lines", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, "manager@caseflow.local");
  const value = page.locator(".progress-widget header strong").filter({ hasText: "Chưa có dữ liệu" });
  await expect(value).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await value.evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.lineHeight * 2 + 1);
});

test("U07: Vietnamese profile has no untranslated Show button", async ({ page }) => {
  await login(page, "agent@caseflow.local");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Hồ sơ cá nhân", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show", exact: true })).toHaveCount(0);
});

test("overview progress widgets remain readable on desktop and mobile", async ({ page }, testInfo) => {
  await login(page, "manager@caseflow.local");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    const widgets = page.locator(".progress-widget");
    await expect(widgets.first()).toBeVisible();
    for (const widget of await widgets.all()) {
      const bounds = await widget.evaluate(element => {
        const parent = element.getBoundingClientRect();
        return [...element.querySelectorAll("header > *")].every(child => {
          const rect = child.getBoundingClientRect();
          return rect.left >= parent.left && rect.right <= parent.right;
        });
      });
      expect(bounds).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true });
  }
});

test("case queue shows a recoverable error after temporary API failure", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  const endpoint = "**/api/cases?*";
  await page.route(endpoint, route => route.fulfill({ status: 503, json: { message: "Audit temporary outage" } }));
  await page.goto("/cases");
  await expect(page.getByText("Audit temporary outage", { exact: true })).toBeVisible();
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.locator(".case-link").first()).toBeVisible();
  await expect(page.getByText("Audit temporary outage", { exact: true })).toHaveCount(0);
});
