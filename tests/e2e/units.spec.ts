import { expect, test, type Page } from "@playwright/test";

const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email tài khoản").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Canho123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("housekeeping marks a returned unit clean and the manager lets it again", async ({ page: housekeeping, browser }, info) => {
  let page = housekeeping;
  // Housekeeping staff may report cleaning but cannot change the letting status.
  await login(page, "le.mai@canho.local");
  await page.goto("/units");
  await page.locator(".unit-chip").filter({ hasText: "Chờ dọn" }).click();
  await page.locator(".unit-tile").filter({ hasText: "A303" }).click();
  const dialog = page.getByRole("dialog", { name: "Căn A303" });
  await expect(dialog.getByLabel("Tình trạng thuê")).toHaveCount(0);
  await dialog.getByLabel("Dọn dẹp / sửa chữa").selectOption("ready");
  await dialog.getByLabel("Ghi chú").fill("Đã dọn và kiểm tra thiết bị");
  await dialog.getByRole("button", { name: "Lưu trạng thái" }).click();
  await expect(dialog).toHaveCount(0);
  await page.locator(".unit-chip").filter({ hasText: "Cho thuê được" }).click();
  await expect(page.locator(".unit-tile").filter({ hasText: "A303" })).toContainText("Cho thuê được");

  // The manager works in a separate browser session.
  const managerContext = await browser.newContext({ baseURL: "http://127.0.0.1:5188" });
  page = await managerContext.newPage();
  await login(page, "pham.ha@canho.local");
  await page.goto("/units");
  // Let the session refresh finish before reloading (refresh tokens are single-use).
  await expect(page.locator(".unit-tile").first()).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.locator(".unit-tile").first()).toBeVisible();
    expect(await fitsWidth(page)).toBe(true);
    await page.screenshot({ path: info.outputPath(`units-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // A302 has tenants on notice: checking out removes them and sends the unit to cleaning.
  await page.locator(".unit-tile").filter({ hasText: "A302" }).click();
  const unit = page.getByRole("dialog", { name: "Căn A302" });
  await expect(unit.getByText("Trần Quốc Minh")).toBeVisible();
  await unit.getByLabel("Tình trạng thuê").selectOption("vacant");
  await unit.getByLabel(/Trả căn: gỡ 1 người thuê/).check();
  await unit.getByLabel("Ghi chú").fill("Khách đã bàn giao chìa khóa");
  await unit.getByRole("button", { name: "Lưu trạng thái" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  const tile = page.locator(".unit-tile").filter({ hasText: "A302" });
  await expect(tile).toContainText("Trống");
  await expect(tile).toContainText("Chờ dọn");
  await managerContext.close();
});
