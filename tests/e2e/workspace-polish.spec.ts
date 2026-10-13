import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.locator(".demo-switcher")).toHaveCount(0);
  await page.getByLabel("Mã tổ chức").fill("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("queue pagination changes records, filters reset pages, sidebar collapse persists", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  const brand = page.locator(".sidebar .brand");
  const collapse = page.getByRole("button", { name: "Thu gọn sidebar", exact: true });
  const brandBox = await brand.boundingBox();
  const buttonBox = await collapse.boundingBox();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(brandBox!.y);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(brandBox!.y + brandBox!.height + 1);
  await page.getByRole("button", { name: "Thu gọn sidebar", exact: true }).click();
  await expect(page.locator(".app-frame")).toHaveClass(/sidebar-collapsed/);
  const expand = page.getByRole("button", { name: "Mở rộng sidebar", exact: true });
  await page.locator(".content").hover();
  await expect(expand.locator(":scope > svg")).toHaveCSS("opacity", "0");
  await expand.hover();
  await expect(expand.locator(":scope > svg")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "artifacts/ui-review/sidebar-logo-expand.png" });
  await page.reload();
  await expect(page.locator(".app-frame")).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "Mở rộng sidebar", exact: true }).click();
  await expect(page.locator(".organization-summary")).toHaveCount(0);
  await page.goto("/cases");
  await expect(page.locator(".cases-table tbody tr")).toHaveCount(8);
  const first = await page.locator(".case-link").first().innerText();
  await page.getByRole("button", { name: "Trang sau", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".pagination-current")).toHaveText(/2 \/ /);
  await expect(page.locator(".case-link").first()).not.toHaveText(first);
  await page.getByLabel("Lọc trạng thái").selectOption("waiting");
  await expect(page).not.toHaveURL(/page=2/);
  await expect(page.locator(".status-tabs")).toHaveCount(0);
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await expect(page.getByLabel("Lọc trạng thái")).toHaveValue("all");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.getByRole("dialog", { name: "Đăng xuất?", exact: true }).getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page).toHaveURL(/\/cases$/);
});

test("student sees relevant controls and live unaccented knowledge matches", async ({ page }) => {
  await login(page, "student@caseflow.local");
  await expect(page.locator(".requester-home")).toBeVisible();
  await expect(page.locator(".requester-summary-grid article").first()).toHaveCSS("border-top-width", "1px");
  const widths = await page.evaluate(() => ({ home: document.querySelector(".requester-home")!.getBoundingClientRect().width, content: document.querySelector(".content")!.clientWidth }));
  expect(widths.home).toBeGreaterThan(widths.content * 0.8);
  await page.goto("/cases");
  await expect(page.getByRole("columnheader", { name: "Ưu tiên", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Lọc ưu tiên")).toHaveCount(0);
  await page.goto("/cases/new");
  await expect(page.getByLabel("Mức ưu tiên", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Kênh tiếp nhận", { exact: true })).toHaveCount(0);
  await page.goto("/knowledge");
  await page.getByLabel("Câu hỏi tra cứu").fill("MAT KHAU");
  await expect(page.locator(".article-list article").first()).toBeVisible();
  await expect(page.locator(".article-list article")).not.toHaveCount(0);
  await page.getByLabel("Câu hỏi tra cứu").fill("zzunrelatedzz");
  await expect(page.locator(".article-list article")).toHaveCount(0);
  await expect(page.getByText("Không có tài liệu khớp từ khóa", { exact: true })).toBeVisible();
});

test("mobile administration has explicit navigation, account access and training export", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin@caseflow.local");
  await page.getByRole("button", { name: "Mở menu", exact: true }).filter({ visible: true }).click();
  await page.locator(".sidebar").getByRole("link", { name: "Vận hành", exact: true }).click();
  await expect(page).toHaveURL(/\/system$/);
  await expect(page.getByRole("button", { name: "Tải dữ liệu huấn luyện CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Tải dữ liệu huấn luyện CSV" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Xuất dữ liệu huấn luyện?" }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("caseflow-reviewed-training.csv");
  await page.getByRole("button", { name: "Menu tài khoản", exact: true }).click();
  await page.getByRole("link", { name: "Hồ sơ cá nhân", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.screenshot({ path: "artifacts/ui-review/mobile-account-profile.png" });
});

test("cancelled create has no side effects and confirmation supports keyboard", async ({ page }) => {
  await login(page, "student@caseflow.local");
  await page.goto("/cases/new");
  let writes = 0;
  page.on("request", request => { if (request.method() === "POST" && /\/api\/cases$/.test(request.url())) writes++; });
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Yêu cầu cần xác nhận");
  await page.getByLabel("Mô tả chi tiết").fill("Tôi cần được hỗ trợ về thủ tục học vụ.");
  await page.getByRole("button", { name: "Tạo hồ sơ", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Gửi yêu cầu?", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(0);
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Yêu cầu cần xác nhận");
});

test("failed attachment upload retains file for retry and successful retry survives reload", async ({ page }) => {
  await login(page, "student@caseflow.local");
  await page.goto("/cases");
  await page.locator(".case-link").first().click();
  const endpoint = "**/api/cases/*/attachments";
  await page.route(endpoint, route => route.request().method() === "POST" ? route.fulfill({ status: 503, json: { message: "Temporary storage failure" } }) : route.continue());
  await page.locator('input[type="file"]').setInputFiles({ name: "retry.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nRetry test\n%%EOF") });
  await page.getByRole("button", { name: "Tải tệp lên", exact: true }).click();
  await page.getByRole("dialog", { name: "Tải tệp lên?", exact: true }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.locator(".file-upload-item").filter({ hasText: "retry.pdf" })).toBeVisible();
  await expect(page.getByText("Không thể tải lên: retry.pdf.", { exact: true })).toBeVisible();
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Tải tệp lên", exact: true }).click();
  await page.getByRole("dialog", { name: "Tải tệp lên?", exact: true }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.locator(".attachment-list").getByText("retry.pdf", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".attachment-list").getByText("retry.pdf", { exact: true })).toBeVisible();
});
