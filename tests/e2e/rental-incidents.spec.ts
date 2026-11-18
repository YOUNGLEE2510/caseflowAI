import { expect, test } from "@playwright/test";

test("manager creates and schedules a shared rental incident", async ({ page, request }, info) => {
  const login = await request.post("/api/auth/login", { data: {
    organizationSlug: "caseflow-rental-local", email: "nguyen.anh@cudan.canho.local", password: "Canho123!"
  } });
  expect(login.ok()).toBe(true);
  const { token } = await login.json();
  const create = await request.post("/api/cases", {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: "Nuoc yeu tai can A301", description: "Nuoc yeu tai tat ca cac voi tu sang nay", propertyCode: "TOWER-A", unitCode: "A301" }
  });
  expect(create.ok()).toBe(true);
  const source = (await create.json()).case;
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption("caseflow-rental-local");
  await page.getByLabel("Email tài khoản").fill("pham.ha@canho.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Canho123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/incidents");
  await page.getByRole("button", { name: "Tạo sự cố", exact: true }).click();
  await page.getByLabel("Tên sự cố").fill("Nuoc yeu tang 3");
  await page.getByLabel("Mã hồ sơ gốc").fill(source.code);
  await page.locator("form").getByRole("button", { name: "Tạo sự cố", exact: true }).click();
  await page.getByRole("button", { name: /Xác nhận/ }).click();
  const card = page.locator(".incident-card").filter({ hasText: "Nuoc yeu tang 3" });
  await card.getByRole("button", { name: "Điều phối" }).click();
  await expect(page.getByLabel("Người phụ trách")).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`incident-${width}.png`) });
  }
  await page.getByLabel("Lịch hẹn sửa").fill("2027-01-10T10:00");
  await page.getByLabel("Trạng thái").selectOption("investigating");
  await page.getByRole("button", { name: "Lưu điều phối", exact: true }).click();
  await page.getByRole("button", { name: /Xác nhận/ }).click();
  await expect(card).toContainText("Đang điều tra");
});

test("manager creates catalog and completes a repair task", async ({ page, request }, info) => {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption("caseflow-rental-local");
  await page.getByLabel("Email tài khoản").fill("pham.ha@canho.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Canho123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/rental");
  await page.getByRole("tab", { name: "Danh mục" }).click();
  await page.getByLabel("Mã", { exact: true }).fill("E2E-TOWER");
  await page.getByLabel("Tên", { exact: true }).fill("Co so kiem thu");
  await page.getByRole("button", { name: "Lưu danh mục", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu.");
  const managerLogin = await request.post("/api/auth/login", { data: {
    organizationSlug: "caseflow-rental-local", email: "pham.ha@canho.local", password: "Canho123!"
  } });
  const managerToken = (await managerLogin.json()).token;
  const asset = await request.put("/api/rental/catalog", { headers: { Authorization: `Bearer ${managerToken}` },
    data: { kind: "asset", propertyCode: "E2E-TOWER", code: "E2E-PUMP", name: "Bom kiem thu", category: "water" } });
  expect(asset.ok()).toBe(true);
  await page.reload();
  await page.getByRole("tab", { name: "Phiếu sửa chữa" }).click();
  await page.getByLabel("Nội dung sửa chữa").fill("Kiem tra bom cap nuoc");
  await page.getByRole("combobox", { name: "Thiết bị", exact: true }).selectOption("E2E-PUMP");
  await page.getByRole("combobox", { name: "Kỹ thuật viên", exact: true }).selectOption({ index: 1 });
  await page.getByLabel("Hạn sửa chữa").fill("2027-01-10T10:00");
  await page.getByRole("button", { name: "Tạo phiếu sửa", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  const task = page.locator("article").filter({ hasText: "Kiem tra bom cap nuoc" });
  await task.getByRole("button", { name: "Bắt đầu", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await task.getByLabel("Kết quả / Lý do").fill("Da kiem tra va phuc hoi ap luc nuoc");
  await task.getByRole("button", { name: "Hoàn thành", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(task).toContainText("Da kiem tra va phuc hoi ap luc nuoc");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`rental-${width}.png`) });
  }
});
