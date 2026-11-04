import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const OTPAuth = createRequire(resolve(process.cwd(), "apps/api/package.json"))("otpauth");

async function login(page: Page, email: string, password = "Demo123!") {
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("temporary password, MFA enrollment and recovery work across desktop and mobile", async ({ page, request }, testInfo) => {
  const admin = await request.post("/api/auth/login", { data: { organizationSlug: "minh-khai-university", email: "admin@caseflow.local", password: "Demo123!" } });
  expect(admin.ok()).toBe(true);
  const { token } = await admin.json();
  const email = `security-${Date.now()}@caseflow.local`;
  const create = await request.post("/api/users", { headers: { Authorization: `Bearer ${token}` }, data: { name: "Security test", email, role: "requester", password: "TemporaryPassword123!" } });
  expect(create.status()).toBe(201);
  await login(page, email, "TemporaryPassword123!");
  await expect(page).toHaveURL(/\/profile$/);
  await page.locator("#current-pw").fill("TemporaryPassword123!");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("OwnerPassword123!");
  await page.getByLabel("Xác nhận mật khẩu mới", { exact: true }).fill("OwnerPassword123!");
  await page.getByRole("button", { name: "Cập nhật mật khẩu", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Xác nhận/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, "OwnerPassword123!");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto("/profile");
  const security = page.locator("section").filter({ has: page.getByRole("heading", { name: "Bảo mật tài khoản", exact: true }) });
  await security.getByLabel("Mật khẩu hiện tại", { exact: true }).fill("OwnerPassword123!");
  await security.getByRole("button", { name: "Thiết lập 2FA", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Xác nhận/ }).click();
  const secret = await page.getByLabel("Khóa 2FA", { exact: true }).inputValue();
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
  await page.getByLabel("Mã Authenticator hoặc mã khôi phục").fill(totp.generate());
  await page.getByRole("button", { name: "Xác nhận 2FA", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Xác nhận/ }).click();
  await expect(page.getByRole("heading", { name: "Mã khôi phục dùng một lần" })).toBeVisible();
  const recovery = (await security.locator("pre").innerText()).split("\n")[0];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    if (width < 900) await expect.poll(() => page.locator("#workspace-sidebar").evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`security-${width}.png`), fullPage: true });
  }
  await security.getByRole("button", { name: "Đăng xuất mọi thiết bị", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Xác nhận/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, email, "OwnerPassword123!");
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByLabel("Mã Authenticator hoặc mã khôi phục").fill(recovery);
  await page.getByRole("button", { name: "Xác nhận 2FA", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Xác nhận/ }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test("owner can cancel or confirm deletion of a mistaken upload", async ({ page, request }, testInfo) => {
  const loginRes = await request.post("/api/auth/login", { data: { organizationSlug: "minh-khai-university", email: "student@caseflow.local", password: "Demo123!" } });
  const { token } = await loginRes.json();
  const create = await request.post("/api/cases", { headers: { Authorization: `Bearer ${token}` }, data: {
    title: `Xóa tệp nhầm ${Date.now()}`, description: "Hồ sơ kiểm thử xóa tệp.", serviceKey: "general_support"
  } });
  const testCase = (await create.json()).case;
  await login(page, "student@caseflow.local");
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto(`/cases/${testCase._id}`);
  await page.locator('input[type="file"]').setInputFiles({ name: "mistaken-private-file.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nSynthetic privacy test\n%%EOF") });
  await page.getByRole("button", { name: "Tải tệp lên", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đang tải lên" })).toHaveCount(0);
  const remove = page.getByRole("button", { name: "Xóa tệp: mistaken-private-file.pdf", exact: true });
  await expect(remove).toBeVisible();
  await remove.click();
  await page.getByRole("dialog").getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(remove).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect.poll(() => page.locator("#workspace-sidebar").evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  await remove.scrollIntoViewIfNeeded();
  const row = remove.locator("xpath=../..");
  expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await row.screenshot({ path: testInfo.outputPath("attachment-delete-mobile.png") });
  await remove.click();
  await page.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(remove).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".attachment-list").getByText("mistaken-private-file.pdf", { exact: true })).toHaveCount(0);
});
