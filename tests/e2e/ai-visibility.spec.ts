import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email tài khoản", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Canho123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("facilitator switches conditions, staff work manually, then export pseudonymous timing", async ({ page: admin, browser, request }, info) => {
  test.setTimeout(480000);
  const errors: string[] = [];
  await login(admin, "tran.khoa@canho.local");
  await admin.goto("/users");
  await admin.getByLabel("Tìm thành viên").fill("pham.ha@canho.local");
  await admin.locator(".user-list button").filter({ hasText: "pham.ha@canho.local" }).click();
  const settings = admin.locator(".ai-study-settings");
  await settings.getByLabel("Mã người tham gia").fill("p01");
  await settings.getByRole("switch", { name: "Ẩn gợi ý AI" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(settings.getByRole("switch")).toBeChecked();

  const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:5188" });
  const staff = await staffContext.newPage();
  staff.on("pageerror", error => errors.push(error.message));
  try {
    await login(staff, "pham.ha@canho.local");
    const auth = await request.post("/api/auth/login", { data: { organizationSlug: "caseflow-rental-local", email: "pham.ha@canho.local", password: "Canho123!" } });
    expect(auth.ok()).toBe(true);
    const { token } = await auth.json();
    const response = await request.get("/api/cases?search=CF-2026-0003", { headers: { Authorization: `Bearer ${token}` } });
    const { cases } = await response.json();
    const item = cases.find((value: { code: string }) => value.code === "CF-2026-0003");
    expect(item).toBeTruthy();
    const path = `/cases/${item._id}`;
    const contrastResults: object[] = [];
    for (const theme of ["light", "dark"] as const) {
      await staff.emulateMedia({ colorScheme: theme });
      await admin.emulateMedia({ colorScheme: theme });
      for (const width of [1440, 390]) {
        await staff.setViewportSize({ width, height: 950 });
        await staff.goto(path);
        await expect(staff.locator(".ai-hidden-notice")).toBeVisible();
        await expect(staff.locator(".ai-insight-panel")).toHaveCount(0);
        await expect(staff.getByRole("heading", { name: "Gợi ý phân công", exact: true })).toHaveCount(0);
        expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await staff.screenshot({ path: info.outputPath(`case-manual-${theme}-${width}.png`), fullPage: true });
        await admin.setViewportSize({ width, height: 950 });
        expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await admin.screenshot({ path: info.outputPath(`users-${theme}-${width}.png`), fullPage: true });
      }
      // Measure contrast at desktop width, where the admin detail panel is on screen.
      await staff.setViewportSize({ width: 1440, height: 950 });
      await admin.setViewportSize({ width: 1440, height: 950 });
      for (const [target, selector] of [[staff, ".ai-hidden-notice"], [admin, ".ai-study-switch span"], [admin, ".study-export button"]] as const) {
        for (const state of ["normal", "hover", "focus"] as const) {
          const locator = target.locator(selector);
          if (state === "hover") await locator.hover();
          if (state === "focus" && selector.includes("button")) await locator.focus();
          const ratio = await locator.evaluate(element => {
            const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
            const ctx = canvas.getContext("2d")!;
            const rgb = (value: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
            const luminance = (color: number[]) => color.slice(0, 3).map(n => n/255).map(n => n <= 0.04045 ? n/12.92 : ((n+0.055)/1.055)**2.4).reduce((sum,n,i) => sum+n*[0.2126,0.7152,0.0722][i],0);
            let bg = [255, 255, 255, 255];
            const chain: Element[] = []; for (let el: Element | null = element; el; el = el.parentElement) chain.unshift(el);
            for (const el of chain) { const c = rgb(getComputedStyle(el).backgroundColor); const alpha = c[3]/255; bg = c.slice(0,3).map((v,i) => v*alpha+bg[i]*(1-alpha)); }
            const fg = rgb(getComputedStyle(element).color); const a = fg[3]/255;
            const foreground = fg.slice(0,3).map((v,i) => v*a+bg[i]*(1-a));
            const [x,y] = [luminance(foreground),luminance(bg)].sort((a,b)=>b-a); return (x+0.05)/(y+0.05);
          });
          contrastResults.push({ theme, selector, state, ratio });
          expect(ratio, `${theme} ${selector} ${state}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    await info.attach("contrast-results", { body: JSON.stringify(contrastResults, null, 2), contentType: "application/json" });
    await staff.goto("/cases/new");
    await expect(staff.locator(".ai-hidden-notice")).toBeVisible();
    await expect(staff.getByRole("button", { name: "Phân tích bằng AI", exact: true })).toHaveCount(0);
    await staff.goto("/knowledge");
    await expect(staff.getByRole("textbox", { name: "Câu hỏi cho kho tri thức" })).toHaveCount(0);
    await expect(staff.getByRole("searchbox", { name: "Tìm trong danh mục" })).toBeVisible();
    // Triage by hand in the UI, as a participant would: set priority, then confirm routing.
    await staff.setViewportSize({ width: 1440, height: 950 });
    await staff.goto(path);
    await staff.getByRole("combobox", { name: "Mức ưu tiên", exact: true }).selectOption("urgent");
    await expect(staff.getByRole("combobox", { name: "Mức ưu tiên", exact: true })).toHaveValue("urgent");
    await staff.getByRole("button", { name: "Xác nhận phân luồng", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Xác nhận phân luồng", exact: true })).toHaveCount(0);

    await settings.getByRole("switch").click();
    await admin.getByRole("dialog").getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(settings.getByRole("switch")).not.toBeChecked();
    // SPA navigation, with the same session: the server's current flag refreshes the web account.
    await staff.getByRole("link", { name: "Hồ sơ", exact: true }).click();
    await staff.getByRole("link", { name: item.code, exact: true }).click();
    await expect(staff.locator(".ai-hidden-notice")).toHaveCount(0);
    await expect(staff.locator(".ai-insight-panel")).toBeVisible();
    for (const theme of ["light", "dark"] as const) for (const width of [1440, 390]) {
      await staff.emulateMedia({ colorScheme: theme }); await staff.setViewportSize({ width, height: 950 });
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await staff.screenshot({ path: info.outputPath(`case-assisted-${theme}-${width}.png`), fullPage: true });
    }
    const form = admin.getByRole("form", { name: "Xuất dữ liệu thử nghiệm" });
    await form.getByLabel("Mã người tham gia (để trống chọn tất cả)").fill("p01");
    const download = admin.waitForEvent("download");
    await form.getByRole("button", { name: "Xuất dữ liệu thử nghiệm", exact: true }).click();
    const file = await download;
    const csv = await readFile((await file.path())!, "utf8");
    expect(csv).toContain("confirmed_at"); expect(csv).toContain('"p01"'); expect(csv).toContain('"manual"');
    expect(csv).toMatch(/"p01","[^"]*","manual","[^"]+","[^"]+","","\d+","\d+","CF-2026-0003","[a-z_]+","urgent"/);
    expect(csv).not.toContain("pham.ha@");
    expect(errors).toEqual([]);
  } finally { await staffContext.close(); }
});
