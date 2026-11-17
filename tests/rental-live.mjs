import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = "http://localhost:8080";
const setup = JSON.parse(await readFile("artifacts/rental-setup/credentials.json", "utf8"));
const manager = setup.credentials.find(item => item.email.startsWith("manager@"));
assert(manager, "Manager credentials are required");
const response = await fetch(base + "/api/auth/login", { method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ organizationSlug: setup.organization, ...manager }) });
assert(response.ok, "Rental manager login failed");
const { token } = await response.json();
async function api(path, method = "GET", data) {
  const result = await fetch(base + "/api" + path, { method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data) });
  assert(result.ok, "Rental API request failed: " + path + " / " + result.status);
  return result.status === 204 ? null : result.json();
}
const catalog = await api("/rental/catalog");
assert.equal(catalog.properties.length, 2);
assert.equal(catalog.units.length, 4);
assert(["PUMP-A", "ROUTER-A", "AC-A301"].every(code => catalog.assets.some(item => item.code === code)));
const classification = await api("/ai/analyze-intake", "POST", { text: "Nước yếu ở tất cả vòi trong căn hộ từ sáng nay" });
assert.equal(classification.classification.label, "water");
const cases = await api("/cases?limit=20");
assert(["RENTAL-DEMO-001", "RENTAL-DEMO-002", "RENTAL-DEMO-005"].every(code => cases.cases.some(item => item.code === code)));
let incident = (await api("/incidents")).incidents.find(item => item.propertyCode === "TOWER-A");
if (!incident) {
  const created = await api("/incidents", "POST", { title: "Nước yếu cơ sở A (mô phỏng)", caseCode: "RENTAL-DEMO-001" });
  incident = { _id: created.id };
}
const options = await api("/incidents/" + incident._id + "/options");
assert(!options.candidates.some(item => item.code === "RENTAL-DEMO-003"));
for (const caseCode of ["RENTAL-DEMO-002", "RENTAL-DEMO-005"]) {
  await api("/incidents/" + incident._id + "/cases", "PUT", { caseCode, linked: true });
}
const tasks = await api("/rental/tasks");
assert(tasks.owners.length > 0);
const currentIncident = (await api("/incidents")).incidents.find(item => item._id === incident._id);
if (!currentIncident.ownerId) await api("/incidents/" + incident._id, "PATCH", {
  version: currentIncident.__v, ownerId: tasks.owners[0]._id, appointmentAt: new Date(Date.now() + 3600000).toISOString(),
  severity: currentIncident.severity, status: "investigating", rootCause: "", resolution: ""
});
if (!tasks.tasks.some(item => item.title === "[Mô phỏng] Kiểm tra bơm cấp nước")) {
  await api("/rental/tasks/live-repair-demo-task", "PUT", {
    assetCode: "PUMP-A", title: "[Mô phỏng] Kiểm tra bơm cấp nước",
    assigneeId: tasks.owners[0]._id, dueAt: new Date(Date.now() + 3600000).toISOString()
  });
}
let repair = (await api("/rental/tasks")).tasks.find(item => item.title === "[Mô phỏng] Kiểm tra bơm cấp nước");
if (repair.status === "planned") {
  await api("/rental/tasks/" + repair._id, "PATCH", { version: repair.__v, status: "in_progress", result: "" });
  repair = (await api("/rental/tasks")).tasks.find(item => item._id === repair._id);
}
if (repair.status === "in_progress") await api("/rental/tasks/" + repair._id, "PATCH", {
  version: repair.__v, status: "completed", result: "Kết quả mô phỏng: bơm đã được kiểm tra; cần xác nhận riêng từng căn."
});
assert((await api("/rental/assets/PUMP-A/history")).tasks.some(item => item.status === "completed"));
const outsider = setup.credentials.find(item => item.organization === "caseflow-rental-isolation-demo");
assert(outsider, "Isolation organization credentials are required");
const outsiderLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ organizationSlug: outsider.organization, email: outsider.email, password: outsider.password }) });
assert(outsiderLogin.ok);
const outsiderToken = (await outsiderLogin.json()).token;
const isolated = await fetch(base + "/api/cases", { headers: { Authorization: "Bearer " + outsiderToken } });
assert.equal((await isolated.json()).total, 0);
await mkdir("artifacts/rental-setup", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base + "/login");
  await page.getByRole("combobox", { name: "Đơn vị vận hành", exact: true }).selectOption(setup.organization);
  await page.getByLabel("Email tài khoản").fill(manager.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(manager.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL("**/overview");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/rental");
    await page.getByRole("heading", { name: "Cơ sở và thiết bị", exact: true }).waitFor();
    await page.getByText("TOWER-A · Dùng chung · Bơm cấp nước dùng chung", { exact: true }).waitFor();
    await page.getByRole("heading", { name: "PUMP-A · [Mô phỏng] Kiểm tra bơm cấp nước", exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Layout overflow");
    await page.screenshot({ path: `artifacts/rental-setup/live-${width}.png`, fullPage: true });
  }
} finally {
  await browser.close();
}
const report = { status: "passed", properties: catalog.properties.length, units: catalog.units.length, assets: catalog.assets.length, cases: cases.total, crossOrganizationReadIsolated: true,
  workflowKind: "scripted-synthetic-demo", sharedReportsLinked: 3, repairTaskCompleted: true,
  classificationProvider: classification.classification.provider, label: classification.classification.label,
  crossPropertyCandidatesExcluded: true, screenshots: [1440, 390] };
await writeFile("artifacts/rental-setup/live-check.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
