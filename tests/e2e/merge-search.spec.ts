import { test, expect } from "@playwright/test";

test("indexed search finds unaccented prefixes and managers merge duplicates without losing history", async ({ page, request }, testInfo) => {
  const login = await request.post("/api/auth/login", { data: { organizationSlug: "minh-khai-university", email: "student@caseflow.local", password: "Demo123!" } });
  const { token } = await login.json();
  const marker = String(Date.now());
  const create = async (suffix: string) => {
    const response = await request.post("/api/cases", { headers: { Authorization: `Bearer ${token}` }, data: {
      title: `Gộp kiểm thử ${marker} ${suffix}`, description: "Em gửi lại cùng một yêu cầu hỗ trợ chung để kiểm thử gộp hồ sơ.", serviceKey: "general_support"
    } });
    expect(response.status()).toBe(201);
    return (await response.json()).case;
  };
  const target = await create("hồ sơ chính"), source = await create("bản trùng");
  await page.goto("/login");
  await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
  await page.getByLabel("Email tổ chức").fill("manager@caseflow.local");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto(`/cases?search=${encodeURIComponent(`gop kiem ${marker}`)}`);
  await expect(page.locator(".case-link")).toHaveCount(2);
  await page.goto(`/cases/${source._id}`);
  await page.getByRole("button", { name: "Gộp hồ sơ trùng", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Gộp hồ sơ trùng");
  const modal = page.getByRole("dialog");
  await modal.getByRole("combobox", { name: "Hồ sơ chính", exact: true }).selectOption(target._id, { timeout: 15000 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(modal).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await modal.screenshot({ path: testInfo.outputPath(`merge-${width}.png`) });
  }
  await modal.getByRole("button", { name: "Gộp hồ sơ", exact: true }).click();
  await page.getByRole("dialog", { name: "Gộp hồ sơ trùng?", exact: true }).getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("link", { name: "Mở hồ sơ chính", exact: true })).toBeVisible();
  await expect(page.locator("#case-routing")).toHaveCount(0);
  await page.getByRole("link", { name: "Mở hồ sơ chính", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hồ sơ đã gộp", exact: true })).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: source.code })).toBeVisible();
});
