import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("incomplete uploads require confirmation before scheduling recovery", async ({ page }) => {
  let pending = true, retries = 0;
  await page.route("**/api/system/jobs", route => route.fulfill({ json: { jobs: pending ? [{ caseId: "111111111111111111111111", code: "FIXTURE-RECOVERY", kind: "upload" }] : [] } }));
  await page.route("**/api/system/jobs/*/retry", async route => {
    expect(route.request().postDataJSON()).toEqual({ kind: "upload" });
    retries++; pending = false; await route.fulfill({ json: { queued: true } });
  });
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill("admin@caseflow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto("/system");
  await expect(page.getByText(/Dọn tệp tải lên chưa hoàn tất/)).toBeVisible();
  await mkdir("artifacts/cloudinary", { recursive: true });
  await page.screenshot({ path: "artifacts/cloudinary/upload-recovery-390.png", fullPage: true });
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
  expect(retries).toBe(0);
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText("FIXTURE-RECOVERY", { exact: false })).toHaveCount(0);
  expect(retries).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("operations names Cloudinary storage correctly on desktop and mobile", async ({ page }) => {
  await page.route("**/api/system/status", async route => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({ response, json: { ...value, storage: { ...value.storage, provider: "cloudinary" } } });
  });
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill("admin@caseflow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await mkdir("artifacts/cloudinary", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/system");
    await expect(page.getByText(/Cloudinary/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/cloudinary/system-${width}.png`, fullPage: true });
  }
});
