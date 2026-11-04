import { test, expect } from "@playwright/test";

test("organization selection, CSV preview and knowledge pagination remain usable on mobile", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill("admin@caseflow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/users");
  await page.getByRole("button", { name: "Nhập CSV", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "users.csv", mimeType: "text/csv", buffer: Buffer.from("name,email,role,team\nPreview Student,preview@example.com,requester,") });
  await expect(dialog).toContainText("preview@example.com");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`csv-${width}.png`) });
  }
  await page.goto("/knowledge");
  await expect(page.getByRole("navigation", { name: "Phân trang tài liệu" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("knowledge-mobile.png") });
});
