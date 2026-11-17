import { test, expect } from "@playwright/test";

for (const [role, email, routes, denied] of [
  ["requester", "nguyen.anh@cudan.canho-demo.local", ["/overview", "/cases", "/cases/new", "/knowledge", "/profile"], ["/api/users", "/api/incidents"]],
  ["agent", "tran.khoi@canho-demo.local", ["/overview", "/cases", "/incidents", "/rental", "/profile"], []],
  ["manager", "pham.ha@canho-demo.local", ["/overview", "/cases", "/incidents", "/rental", "/users", "/services", "/system", "/profile"], []],
  ["org_admin", "tran.khoa@canho-demo.local", ["/overview", "/cases", "/incidents", "/rental", "/users", "/services", "/system", "/profile"], []],
  ["platform_admin", "platform@caseflow.local", ["/overview", "/cases", "/incidents", "/rental", "/users", "/services", "/system", "/profile"], []]
] as const) {
  test(`${role} navigates allowed screens and respects API restrictions`, async ({ page, request }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.url().includes("/api/") && response.status() >= 500) errors.push(`HTTP ${response.status()}`); });
    const login = await request.post("/api/auth/login", { data: { organizationSlug: "caseflow-rental-local", email, password: "Demo123!" } });
    expect(login.ok()).toBe(true);
    const { token } = await login.json();
    for (const path of denied) expect((await request.get(path, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
    if (role === "agent") {
      const directory = await request.get("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      expect(directory.ok()).toBe(true);
      const { users } = await directory.json();
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((user: { role: string; team: string; passwordHash?: string }) => user.role === "agent" && user.team === users[0].team && !user.passwordHash)).toBe(true);
      expect((await request.post("/api/users", { headers: { Authorization: `Bearer ${token}` }, data: {} })).status()).toBe(403);
    }
    await page.goto("/login");
    await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption("caseflow-rental-local");
    await page.getByLabel("Email tài khoản", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/overview$/);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator(".app-frame main h1").first()).toBeVisible();
      await expect(page.locator("main .spinner").first()).toBeHidden();
      expect(await page.locator("main [role=alert]").count()).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${role}-mobile.png`), fullPage: true, animations: "disabled" });
    expect(errors).toEqual([]);
  });
}
