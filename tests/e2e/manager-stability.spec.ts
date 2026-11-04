import { test, expect } from "@playwright/test";

test("manager pages survive repeated full reloads without a render boundary", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && message.text().startsWith("Uncaught error in component tree:")) errors.push(message.text());
  });
  page.on("requestfailed", request => {
    if (request.resourceType() === "script" && !request.failure()?.errorText.includes("ERR_ABORTED")) errors.push(`${new URL(request.url()).pathname}: ${request.failure()?.errorText}`);
  });
  try {
    await page.goto("/login");
    await page.getByRole("combobox", { name: "Tổ chức", exact: true }).selectOption("minh-khai-university");
    await page.getByLabel("Email tổ chức").fill("manager@caseflow.local");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Demo123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/overview$/);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (let round = 0; round < 2; round++) {
        for (const route of ["users", "profile", "overview", "services"]) {
          await test.step(`${width}px /${route} round ${round + 1}`, async () => {
            await page.goto(`/${route}`);
            await expect(page.locator(".content")).toBeVisible();
            await expect(page.locator(".content .spinner")).toHaveCount(0);
            await expect(page.locator(".content .state-error")).toHaveCount(0);
            expect(errors).toEqual([]);
          });
        }
      }
    }
  } finally {
    if (errors.length) await testInfo.attach("render-errors", { body: JSON.stringify(errors, null, 2), contentType: "application/json" });
  }
});

test("E2E shutdown cannot be requested without its control token", async ({ request }) => {
  const denied = await request.post("/__e2e/shutdown");
  expect(denied.status()).toBe(403);
  expect((await request.get("/api/health")).ok()).toBe(true);
});
