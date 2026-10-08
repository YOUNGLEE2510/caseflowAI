import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const roles = [
  { name: "requester", email: "student@caseflow.local", routes: ["overview", "cases", "cases/new", "knowledge", "profile"] },
  { name: "agent", email: "agent@caseflow.local", routes: ["overview", "cases", "knowledge", "incidents", "profile"] },
  { name: "manager", email: "manager@caseflow.local", routes: ["overview", "cases", "knowledge", "incidents", "services", "users", "profile"] },
  { name: "admin", email: "admin@caseflow.local", routes: ["overview", "system", "services", "users"] }
];

for (const role of roles) {
  test(`consistent text and layout for ${role.name}`, async ({ page }) => {
    test.setTimeout(300000);
    await mkdir("artifacts/typography", { recursive: true });
    await page.goto("/login");
    await page.getByLabel("Mã tổ chức").fill("minh-khai-university");
    await page.getByLabel("Email tổ chức").fill(role.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/overview$/);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of role.routes) {
        await page.goto(`/${route}`);
        await expect(page.locator(".content")).toBeVisible();
        await expect(page.locator(".content .spinner")).toHaveCount(0);
        await expect(page.locator(".content .state-error")).toHaveCount(0);
        if (route === "overview" && role.name !== "requester") {
          await expect(page.locator(".dashboard-charts")).toBeVisible();
        }
        await page.evaluate(() => document.fonts.ready);
        const measurements = await page.evaluate(() => {
          const content = document.querySelector(".service-workspace")!;
          const headings = [...document.querySelectorAll(".content h1")];
          return {
            width: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            bodySize: getComputedStyle(content).fontSize,
            headings: headings.map(node => ({ size: getComputedStyle(node).fontSize, weight: Number(getComputedStyle(node).fontWeight) }))
          };
        });
        expect(measurements.width, `${role.name} ${route} ${width}`).toBeLessThanOrEqual(measurements.viewport + 1);
        expect(measurements.bodySize).toBe("15px");
        if (width === 390) {
          const bounds = await page.evaluate(() => {
            const brand = document.querySelector(".mobile-brand")!;
            const title = document.querySelector(".topbar-title")!;
            const left = getComputedStyle(brand).display !== "none" ? brand : title;
            const actions = document.querySelector(".topbar-actions")!;
            return { leftRight: left.getBoundingClientRect().right, actionsLeft: actions.getBoundingClientRect().left };
          });
          expect(bounds.leftRight).toBeLessThanOrEqual(bounds.actionsLeft);
        }
        for (const heading of measurements.headings) {
          expect(heading.size).toBe("24px");
          expect(heading.weight).toBeLessThanOrEqual(600);
        }
        await page.screenshot({ path: `artifacts/typography/${role.name}-${route.replaceAll("/", "-")}-${width}.png`, fullPage: true });
      }
    }
  });
}
