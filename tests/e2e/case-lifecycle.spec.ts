import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Mã tổ chức").fill("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("requester rating, close and reopen persist", async ({ page }) => {
  await login(page, "student@caseflow.local");
  await page.goto("/cases?status=resolved");
  await expect(page.locator(".case-link").first()).toBeVisible();
  await page.locator(".case-link").first().click();
  await page.getByRole("button", { name: "5/5", exact: true }).click();
  await page.getByRole("dialog", { name: "Xác nhận thao tác" }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByText("Bạn đã đánh giá 5/5. Có thể chọn lại để cập nhật.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Bạn đã đánh giá 5/5. Có thể chọn lại để cập nhật.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận đóng", exact: true }).click();
  await page.getByRole("dialog", { name: "Xác nhận thao tác" }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mở lại yêu cầu", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa-2026-10-12/02-rating-closed.png", fullPage: true });
  await page.getByRole("button", { name: "Mở lại yêu cầu", exact: true }).click();
  await page.getByRole("dialog", { name: "Xác nhận thao tác" }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mở lại yêu cầu", exact: true })).toHaveCount(0);
});

test("profile change survives reload", async ({ page }) => {
  await login(page, "student2@caseflow.local");
  await page.goto("/profile");
  await page.getByRole("button", { name: "Chỉnh sửa", exact: true }).click();
  await page.getByLabel("Họ tên", { exact: true }).fill("Người dùng kiểm thử QA");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await page.getByRole("dialog", { name: "Lưu thông tin cá nhân?" }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Người dùng kiểm thử QA", exact: true })).toBeVisible();
});

test("incident modal lists every linked case on mobile", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/incidents");
  await page.getByRole("button", { name: "Xem 3 hồ sơ liên kết", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Gián đoạn cổng thông tin sinh viên", exact: true });
  await expect(dialog.getByRole("link")).toHaveCount(3);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  const titleWidth = await dialog.locator(".incident-case-list strong").first().evaluate(node => node.getBoundingClientRect().width);
  expect(titleWidth).toBeGreaterThan(200);
  await page.screenshot({ path: "artifacts/qa-2026-10-12/03-incident-links-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("mobile drawer traps focus, closes with Escape and excludes hidden links", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
  const open = page.getByRole("button", { name: "Mở menu", exact: true }).filter({ visible: true });
  await open.click();
  await expect(page.locator(".sidebar")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".app-main")).toHaveAttribute("inert", "");
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".sidebar")))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
});

test("operational KPIs and priority queue distinguish missing data from completed work", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  await expect(page.locator(".operations-progress")).toContainText("Chưa có dữ liệu");
  await expect(page.locator(".priority-table .badge-resolved, .priority-table .badge-closed")).toHaveCount(0);
  await page.route("**/api/analytics/csat", route => route.fulfill({ status: 503, json: { message: "Service unavailable" } }));
  await page.reload();
  await expect(page.locator(".operations-progress")).toContainText("Không thể tải chỉ số");
});
