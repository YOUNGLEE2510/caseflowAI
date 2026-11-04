import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("requester rating, close and reopen persist", async ({ page }) => {
  const credentials = { organizationSlug: "minh-khai-university", password: "Demo123!" };
  const studentLogin = await page.request.post("/api/auth/login", { data: { ...credentials, email: "student@caseflow.local" } });
  expect(studentLogin.ok()).toBeTruthy();
  const student = await studentLogin.json();
  const managerLogin = await page.request.post("/api/auth/login", { data: { ...credentials, email: "manager@caseflow.local" } });
  expect(managerLogin.ok()).toBeTruthy();
  const manager = await managerLogin.json();
  const staffHeaders = { Authorization: `Bearer ${manager.token}` };
  const services = await (await page.request.get("/api/services", { headers: staffHeaders })).json();
  const users = await (await page.request.get("/api/users", { headers: staffHeaders })).json();
  const service = services.services.find((item: { team: string }) => users.users.some((user: { role: string; team: string }) => user.role === "agent" && user.team === item.team));
  expect(service).toBeTruthy();
  const assignee = users.users.find((user: { role: string; team: string }) => user.role === "agent" && user.team === service.team);
  const created = await page.request.post("/api/cases", { headers: { Authorization: `Bearer ${student.token}` }, data: {
    title: "Lifecycle fixture", description: "A deterministic request for lifecycle verification.", serviceKey: service.key,
    customFields: Object.fromEntries((service.requiredFields || []).map((key: string) => [key, "E2E fixture"])) } });
  expect(created.ok()).toBeTruthy();
  const fixture = (await created.json()).case;
  expect((await page.request.patch(`/api/cases/${fixture._id}`, { headers: staffHeaders, data: { confirmAi: true, assigneeId: assignee.id, status: "in_progress" } })).ok()).toBeTruthy();
  expect((await page.request.patch(`/api/cases/${fixture._id}`, { headers: staffHeaders, data: { status: "resolved", resolutionNote: "Completed deterministic lifecycle fixture." } })).ok()).toBeTruthy();
  await page.context().clearCookies();
  await login(page, "student@caseflow.local");
  await page.goto(`/cases/${fixture._id}`);
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

test("review safeguards fit desktop and mobile", async ({ page }) => {
  await login(page, "manager@caseflow.local");
  await page.goto("/cases");
  await page.locator(".case-link").first().click();
  await expect(page.getByText("Tệp nội bộ, không hiển thị cho sinh viên", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lấy gợi ý", exact: true }).click();
  await expect(page.getByRole("button", { name: "Chấp nhận", exact: true }).first()).toBeVisible();
  for (const viewport of [{ width: 1536, height: 960 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 600) await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/product-fixes-20261019/detail-${viewport.width}.png`, fullPage: true, animations: "disabled" });
  }
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
  await page.route("**/api/analytics/csat", route => route.fulfill({ status: 200, json: {
    eligible: 0, responses: 0, responseRate: null, averageScore: null, distribution: []
  } }));
  await login(page, "manager@caseflow.local");
  await expect(page.locator(".operations-progress")).toContainText("Chưa có dữ liệu");
  await expect(page.locator(".priority-table .badge-resolved, .priority-table .badge-closed")).toHaveCount(0);
  await page.route("**/api/analytics/csat", route => route.fulfill({ status: 503, json: { message: "Service unavailable" } }));
  await page.reload();
  await expect(page.locator(".operations-progress")).toContainText("Không thể tải chỉ số");
});
