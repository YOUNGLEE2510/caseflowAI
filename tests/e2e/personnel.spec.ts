import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("personnel directory, work schedule and leave form fit desktop and mobile", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill("admin@caseflow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/personnel");
  await expect(page.getByRole("heading", { name: "Nhân sự", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Tải / giới hạn" })).toBeVisible();
  await page.getByRole("button", { name: /^Sửa / }).first().click();
  await expect(page.getByRole("group", { name: "Lịch làm việc (giờ Việt Nam)" })).toBeVisible();
  await mkdir("artifacts/personnel", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(500);
    await expect(page.getByLabel("Từ ngày", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/personnel/personnel-${width}.png`, fullPage: true });
  }
});
