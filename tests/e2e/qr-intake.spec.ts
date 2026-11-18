import { expect, test } from "@playwright/test";

const fitsWidth = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test("tenant without an account reports through a unit QR code and staff verify it", async ({ page, browser }, info) => {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption("caseflow-rental-local");
  await page.getByLabel("Email tài khoản").fill("pham.ha@canho-demo.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);

  // Manager issues the printable code for unit A301.
  await page.goto("/rental");
  await page.getByRole("tab", { name: "Mã QR theo căn" }).click();
  const panel = page.locator(".unit-qr-panel");
  await panel.getByRole("combobox").nth(0).selectOption("TOWER-A");
  await panel.getByRole("combobox").nth(1).selectOption("A301");
  await panel.getByRole("button", { name: "Tạo mã QR" }).click();
  await page.getByRole("button", { name: /Xác nhận/ }).click();
  await expect(panel.getByRole("img", { name: /Mã QR báo sự cố căn A301/ })).toBeVisible();
  const link = (await panel.locator(".unit-qr-url code").innerText()).trim();
  expect(link).toMatch(/\/r\/[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/);
  await panel.screenshot({ path: info.outputPath("unit-qr-panel.png") });

  // A visitor with no session opens the code on a phone.
  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await visitor.newPage();
  await phone.goto(link);
  await expect(phone.getByRole("heading", { name: "Báo sự cố căn hộ" })).toBeVisible();
  await expect(phone.getByText("A301", { exact: true })).toBeVisible();
  await expect(phone.getByRole("note")).toContainText("114");
  expect(await fitsWidth(phone)).toBe(true);
  await phone.screenshot({ path: info.outputPath("qr-report-390.png"), fullPage: true });
  await phone.getByLabel("Họ tên").fill("Khach Chua Co Tai Khoan");
  await phone.getByLabel("Số điện thoại để ban quản lý gọi lại").fill("0901 222 333");
  await phone.getByLabel("Mô tả sự cố").fill("Dieu hoa phong ngu khong lanh tu toi qua.");
  await phone.getByRole("button", { name: "Gửi phản ánh" }).click();
  await expect(phone.getByRole("status")).toContainText("Đã gửi phản ánh");
  const code = (await phone.locator(".qr-done strong").innerText()).trim();
  await phone.screenshot({ path: info.outputPath("qr-report-done-390.png"), fullPage: true });
  await visitor.close();

  // Staff see the flag, cannot assign yet, then verify after calling back.
  await page.goto(`/cases?search=${encodeURIComponent(code)}`);
  const row = page.locator("tr").filter({ hasText: code });
  await expect(row).toContainText("Gửi qua QR — chờ xác minh");
  await row.getByRole("link", { name: code }).click();
  const intake = page.locator(".intake-panel");
  await expect(intake).toContainText("Chờ xác minh người gửi");
  await expect(intake.getByRole("link", { name: /0901222333/ })).toHaveAttribute("href", "tel:0901222333");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await fitsWidth(page)).toBe(true);
    await intake.screenshot({ path: info.outputPath(`intake-panel-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 950 });
  await intake.getByLabel("Ghi chú xác minh").fill("Da goi lai, khach xac nhan dang o can A301");
  await intake.getByRole("button", { name: "Xác minh" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.locator(".intake-panel")).toContainText("Đã xác minh phản ánh qua mã QR");
});
