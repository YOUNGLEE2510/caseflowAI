import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Mã tổ chức").fill("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function overflow(page: Page) {
  const layout = await page.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth, overflowing: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 8).map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })) }));
  expect(layout.content, `${page.url()} ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.width + 1);
}

test("login provider logos and password borders render on desktop and mobile", async ({ page }) => {
  await mkdir("artifacts/login-ui", { recursive: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Tiếp tục với Google", exact: true })).toBeVisible();
    expect(await page.getByRole("button", { name: "Tiếp tục với Google", exact: true }).evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("1px");
    await expect(page.getByRole("button", { name: "Tiếp tục với Outlook / Microsoft", exact: true })).toBeVisible();
    const images = await page.locator(".login-panel .provider-mark").evaluateAll((nodes) => nodes.map((node) => ({ complete: (node as HTMLImageElement).complete, width: (node as HTMLImageElement).naturalWidth })));
    expect(images).toHaveLength(2);
    expect(images.every((item) => item.complete && item.width > 0)).toBe(true);
    const dimensions = await page.locator(".password-field").evaluate((node) => {
      const box = node.getBoundingClientRect();
      const input = node.querySelector("input")!.getBoundingClientRect();
      const button = node.querySelector("button")!.getBoundingClientRect();
      return { box: { top: box.top, bottom: box.bottom, right: box.right }, input: { top: input.top, bottom: input.bottom }, button: { top: button.top, bottom: button.bottom, right: button.right }, border: getComputedStyle(node).borderTopWidth };
    });
    expect(dimensions.border).toBe("1px");
    expect(dimensions.input.top).toBeGreaterThanOrEqual(dimensions.box.top);
    expect(dimensions.input.bottom).toBeLessThanOrEqual(dimensions.box.bottom);
    expect(dimensions.button.right).toBeLessThanOrEqual(dimensions.box.right);
    await page.getByRole("button", { name: "Hiện mật khẩu", exact: true }).click();
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ẩn mật khẩu", exact: true }).click();
    await overflow(page);
    await page.screenshot({ path: `artifacts/login-ui/login-${viewport.width}.png`, fullPage: true });
  }
});

test("password reset request is available without disclosing account existence", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Quên mật khẩu?", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Đặt lại mật khẩu" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Mã tổ chức").fill("minh-khai-university");
  await dialog.getByLabel("Email tổ chức").fill("student@caseflow.local");
  await dialog.getByRole("button", { name: "Gửi hướng dẫn", exact: true }).click();
  await expect(dialog.getByText("Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email đã đăng ký.", { exact: true })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByText("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", { exact: true })).toBeVisible();
});

test("knowledge drafting displays citations and retrieval fallback without external API calls", async ({ page }) => {
  await login(page, "admin@caseflow.local");
  await page.route("**/api/knowledge/capabilities", (route) => route.fulfill({ json: { generation: true } }));
  let calls = 0;
  await page.route("**/api/knowledge/search", async (route) => {
    expect(route.request().postDataJSON().generate).toBe(true);
    calls++;
    await route.fulfill({ json: { answer: calls === 1 ? "Liên hệ đơn vị hỗ trợ [S1]" : "Kết quả tra cứu nội bộ",
      citations: [{ id: "test-source", title: "Quy trình hỗ trợ", sourceLabel: "Tài liệu thử nghiệm", excerpt: "Liên hệ đơn vị hỗ trợ.", score: 0.8 }],
      generation: calls === 1 ? { mode: "generated" } : { mode: "retrieval", reason: "provider_unavailable" } } });
  });
  await page.goto("/knowledge");
  await page.getByRole("checkbox", { name: "Soạn bản nháp qua dịch vụ AI bên ngoài" }).check();
  await page.getByLabel("Câu hỏi tra cứu").fill("Tôi cần hỗ trợ tài khoản");
  await page.getByRole("button", { name: "Tra cứu", exact: true }).click();
  await expect(page.getByText("Bản nháp · Cần kiểm duyệt", { exact: true })).toBeVisible();
  await expect(page.getByText("[S1] Quy trình hỗ trợ", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await overflow(page);
  await page.getByRole("button", { name: "Tra cứu", exact: true }).click();
  await expect(page.getByText("Đang hiển thị kết quả tra cứu nội bộ.", { exact: true })).toBeVisible();
  await expect(page.getByText("Bản nháp · Cần kiểm duyệt", { exact: true })).toHaveCount(0);
});

test("operational queues and workload suggestions render on desktop and mobile", async ({ page }) => {
  await login(page, "admin@caseflow.local");
  await page.goto("/cases");
  await page.getByLabel("Hàng đợi công việc").selectOption("unassigned");
  await expect(page).toHaveURL(/queue=unassigned/);
  await expect(page.locator(".loading-state")).toHaveCount(0);
  await page.locator(".case-link").first().click();
  await expect(page.getByRole("heading", { name: "Gợi ý phân công" })).toBeVisible();
  await expect(page.locator(".assignment-options")).toBeVisible();
  await overflow(page);
  await page.screenshot({ path: "artifacts/ui-review/assignment-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await overflow(page);
  await page.screenshot({ path: "artifacts/ui-review/assignment-mobile.png", fullPage: true });
  await page.goto("/cases?queue=due_soon");
  await expect(page.getByLabel("Hàng đợi công việc")).toHaveValue("due_soon");
  await overflow(page);
});

test("admin creates, edits and disables catalog/member records and publishes knowledge", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "admin@caseflow.local");
  await page.goto("/services");
  await page.getByRole("button", { name: "Thêm dịch vụ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mã dịch vụ").fill("test_service");
  await dialog.getByLabel("Tên dịch vụ").fill("Dịch vụ kiểm thử");
  await dialog.getByLabel("Đơn vị phụ trách").fill("Trung tâm CNTT");
  await dialog.getByRole("button", { name: "Lưu dịch vụ" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button").filter({ hasText: "Dịch vụ kiểm thử" }).click();
  await page.getByRole("button", { name: "Sửa cấu hình" }).click();
  await dialog.getByLabel("Đang hoạt động").uncheck();
  await dialog.getByRole("button", { name: "Lưu dịch vụ" }).click();
  await expect(page.getByRole("button").filter({ hasText: "Dịch vụ kiểm thử" })).toContainText("Tạm dừng");
  await page.goto("/users");
  await page.getByRole("button", { name: "Thêm thành viên", exact: true }).click();
  await dialog.getByLabel("Họ tên").fill("Thành viên kiểm thử");
  await dialog.getByLabel("Email", { exact: true }).fill("e2e-member@caseflow.local");
  await dialog.getByLabel("Mật khẩu ban đầu").fill("StrongTest123!");
  await dialog.getByRole("button", { name: "Lưu thành viên" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button").filter({ hasText: "e2e-member@caseflow.local" }).click();
  await page.getByRole("button", { name: "Sửa thành viên" }).click();
  await dialog.getByLabel("Đang hoạt động").uncheck();
  await dialog.getByRole("button", { name: "Lưu thành viên" }).click();
  await expect(page.getByRole("button").filter({ hasText: "e2e-member@caseflow.local" })).toContainText("Đã khóa");
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "Thêm tài liệu" }).click();
  await dialog.getByLabel("Tên tài liệu").fill("Quy trình kiểm thử tài khoản");
  await dialog.getByLabel("Nội dung", { exact: true }).fill("Sinh viên liên hệ trung tâm hỗ trợ qua cổng dịch vụ khi không đăng nhập được tài khoản.");
  await dialog.getByLabel("Nguồn ban hành").fill("Tài liệu kiểm thử");
  await dialog.getByLabel("Phê duyệt và công bố").check();
  await dialog.getByRole("button", { name: "Lưu tài liệu" }).click();
  await expect(page.getByRole("heading", { name: "Quy trình kiểm thử tài khoản" })).toBeVisible();
  await page.goto("/system");
  await expect(page.getByText("Đã kết nối", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "knowledge.create", exact: true })).toBeVisible();
  await overflow(page);
  await mkdir("artifacts/ui-review", { recursive: true });
  await page.screenshot({ path: "artifacts/ui-review/upgraded-system-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("request intake, real file round-trip, staff review and private notes", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page, "student@caseflow.local");
  await page.goto("/cases/new");
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Hỗ trợ tài khoản kiểm thử");
  await page.getByLabel("Mô tả chi tiết").fill("Em cần hỗ trợ khôi phục tài khoản cổng sinh viên để đăng ký học phần.");
  await page.getByLabel("Dịch vụ", { exact: true }).selectOption("it_access");
  await page.getByLabel("Mã sinh viên", { exact: true }).fill("SV2026001");
  const file = Buffer.from("%PDF-1.4\nTest file round-trip\n%%EOF");
  await page.locator('input[type="file"]').setInputFiles({ name: "request.pdf", mimeType: "application/pdf", buffer: file });
  await page.getByRole("button", { name: "Tạo hồ sơ" }).click();
  await expect(page).toHaveURL(/\/cases\/(?!new$)[^/]+$/);
  await expect(page.getByText("SV2026001", { exact: true })).toBeVisible();
  const caseUrl = page.url();
  await expect(page.getByText("request.pdf", { exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải tệp: request.pdf" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(file);
  const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:5188" });
  const staff = await staffContext.newPage();
  try {
    await login(staff, "manager@caseflow.local");
    await staff.goto(caseUrl);
    await staff.getByRole("button", { name: "Xác nhận phân luồng" }).click();
    await expect(staff.getByRole("button", { name: "Xác nhận phân luồng" })).not.toBeVisible();
    await staff.getByLabel("Người xử lý", { exact: true }).selectOption({ label: "Lê Hoàng Nam · Trung tâm CNTT" });
    await expect(staff.getByLabel("Trạng thái", { exact: true }).locator('option[value="in_progress"]')).toHaveCount(1);
    await staff.getByLabel("Trạng thái", { exact: true }).selectOption("in_progress");
    await expect(staff.getByLabel("Trạng thái", { exact: true })).toHaveValue("in_progress");
    await staff.locator(".comment-form textarea").fill("PRIVATE STAFF NOTE");
    await staff.getByLabel("Ghi chú nội bộ").check();
    await staff.locator(".comment-form").getByRole("button", { name: /Gửi/ }).click();
    await expect(staff.getByText("PRIVATE STAFF NOTE", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("PRIVATE STAFF NOTE", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Đang xử lý", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: "artifacts/ui-review/upgraded-case-desktop.png", fullPage: true });
  } finally { await staffContext.close(); }
  expect(errors).toEqual([]);
});

test("mobile admin dialogs, navigation and pagination stay within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin@caseflow.local");
  for (const route of ["/cases", "/users", "/services", "/knowledge", "/system"]) {
    await page.goto(route);
    await expect(page.locator(".page-stack")).toBeVisible();
    await expect(page.locator(".loading-state")).toHaveCount(0);
    await overflow(page);
  }
  await page.goto("/services");
  await page.getByRole("button", { name: "Thêm dịch vụ", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await overflow(page);
  expect(await page.getByRole("dialog").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: "artifacts/ui-review/upgraded-service-mobile.png", fullPage: true });
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
});
