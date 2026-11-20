import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { parse } from "csv-parse/sync";

vi.mock("../src/services/aiClient.js", () => ({
  fallbackClassify: () => ({ modelVersion: "fallback-v1", label: "water", confidence: 0.4, summary: "Leak", extracted: {}, topCandidates: [], provider: "fallback" }),
  classifyText: async () => ({ modelVersion: "test", label: "water", confidence: 0.9, summary: "Leak", extracted: {}, topCandidates: [{ label: "water", confidence: 0.9 }], provider: "test" }),
  findSimilarCases: async () => [],
  findRelatedCases: async () => [],
  predictSla: async () => ({ riskScore: 0.9, factors: ["test"] }),
  retrieveKnowledge: async () => ({ answer: "Có căn cứ", citations: [{ id: "k1", title: "Quy trình", excerpt: "x", score: 0.5, sourceLabel: "Nội bộ" }] })
}));

const secret = "ai-visibility-test-secret-not-for-production";
let database: MongoMemoryServer;
let server: Server;
let base: string;
let models: typeof import("../src/models.js");
const people: Record<string, any> = {};
let org: any;
let record: any;

const bearer = (user: any) => jwt.sign({ id: String(user._id), organizationId: String(user.organizationId), tokenVersion: 0 }, secret, { expiresIn: "1h" });
async function call(path: string, user: any, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer(user)}` } });
  const text = await response.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  vi.stubEnv("MONGODB_URI", database.getUri());
  vi.stubEnv("MONGODB_DB", "caseflow_ai_visibility_test");
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("AUTO_SEED", "false");
  vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "10000");
  vi.stubEnv("CASE_TRIAGE_MODE", "background");
  const { app } = await import("../src/app.js");
  models = await import("../src/models.js");
  await mongoose.connect(database.getUri(), { dbName: "caseflow_ai_visibility_test" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;

  org = await models.Organization.create({ slug: "study-a", name: "Study A", settings: { serviceDomain: "rental" } });
  const other = await models.Organization.create({ slug: "study-b", name: "Study B", settings: { serviceDomain: "rental" } });
  const make = (key: string, organization: any, role: string, extra: Record<string, unknown> = {}) => models.User.create({
    organizationId: organization._id, email: `${key}@study.test`, name: key, role, team: role === "requester" ? "" : "Kỹ thuật điện nước",
    passwordHash: "x".repeat(60), active: true, ...extra });
  people.admin = await make("admin", org, "org_admin");
  people.hidden = await make("hidden", org, "manager", { aiSuggestionsHidden: true, studyCode: "p01" });
  people.shown = await make("shown", org, "manager", { studyCode: "p02" });
  people.agent = await make("agent", org, "agent", { skills: ["water"] });
  people.resident = await make("resident", org, "requester");
  people.outsider = await make("outsider", other, "org_admin");
  await models.ServiceDefinition.create({ organizationId: org._id, key: "water", name: "Cấp thoát nước", category: "water",
    team: "Kỹ thuật điện nước", slaHours: 8, active: true });
  record = await models.CaseRecord.create({
    organizationId: org._id, code: "STUDY-1", title: "Rò nước", description: "Ống nước dưới bồn rửa rò liên tục", serviceKey: "water",
    category: "water", requesterId: people.resident._id, requesterName: "resident", team: "Kỹ thuật điện nước", status: "new",
    dueAt: new Date(Date.now() + 6 * 3600000),
    ai: { processingStatus: "complete", classification: "water", confidence: 0.91, summary: "Rò nước dưới bồn", riskScore: 0.92,
      suggestedResponse: "Kỹ thuật sẽ đến kiểm tra", sharedIncidentCandidate: true, reviewStatus: "corrected", humanCorrectedLabel: "appliances" },
    events: [
      { type: "created", label: "Đã tiếp nhận", actorName: "resident" },
      { type: "ai_triage", label: "AI phân loại: water", actorName: "CaseFlow AI", internal: true },
      { type: "ai_reviewed", label: "Đã điều chỉnh phân loại AI thành appliances", actorName: "shown" }
    ]
  });
  await models.Notification.create([
    { organizationId: org._id, userId: people.hidden._id, type: "sla_warning", title: "STUDY-1 có nguy cơ trễ SLA", message: "Rủi ro dự báo 92%" },
    { organizationId: org._id, userId: people.hidden._id, type: "sla_warning", title: "STUDY-1 đã quá hạn SLA", message: "Cần kiểm tra" }
  ]);
}, 180000);

afterAll(async () => {
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
  await mongoose.disconnect();
  await database?.stop();
  vi.unstubAllEnvs();
});

const AI_KEYS = ["classification", "confidence", "summary", "riskScore", "suggestedResponse", "sharedIncidentCandidate", "reviewStatus", "humanCorrectedLabel"];
// "corrected" must never reach a hidden viewer: it reveals that the AI suggested something else.

describe("AI suggestions hidden for a study account", () => {
  it("withholds AI fields and AI wording from case detail and list, but not for other staff", async () => {
    const hidden = await call(`/cases/${record._id}`, people.hidden);
    expect(hidden.status).toBe(200);
    expect(hidden.body.case.ai).toEqual({ processingStatus: "complete", reviewStatus: "reviewed" });
    expect(hidden.body.case.events.map((event: any) => event.type)).not.toContain("ai_triage");
    const review = hidden.body.case.events.find((event: any) => event.type === "ai_reviewed");
    expect(review.label).toBe("Đã xác nhận phân loại");
    expect(JSON.stringify(hidden.body.case)).not.toMatch(/appliances|AI phân loại|0\.92/);

    const list = await call("/cases", people.hidden);
    expect(list.body.cases[0].ai).toEqual({ processingStatus: "complete", reviewStatus: "reviewed" });

    const shown = await call(`/cases/${record._id}`, people.shown);
    for (const key of AI_KEYS) expect(shown.body.case.ai).toHaveProperty(key);
    expect(shown.body.case.events.map((event: any) => event.type)).toContain("ai_triage");
  });

  it("answers every AI-only endpoint with an empty shape for the hidden account only", async () => {
    expect((await call("/ai/analyze-intake", people.hidden, "POST", { text: "Ống nước dưới bồn rửa rò liên tục" })).body).toEqual({ analysis: null, hidden: true });
    expect((await call("/recommendations", people.hidden, "POST", { caseId: String(record._id) })).body).toEqual({ recommendation: null, hidden: true });
    expect((await call("/recommendations/overview", people.hidden, "POST", {})).body).toEqual({ recommendation: null, hidden: true });
    expect((await call(`/cases/${record._id}/related`, people.hidden)).body).toEqual({ matches: [], hidden: true });
    expect((await call("/knowledge/search", people.hidden, "POST", { query: "rò nước bồn rửa" })).body).toEqual({ answer: "", citations: [], hidden: true });
    expect((await call("/analytics/ai-accuracy", people.hidden)).body).toEqual({ hidden: true });

    expect((await call("/ai/analyze-intake", people.shown, "POST", { text: "Ống nước dưới bồn rửa rò liên tục" })).body.hidden).toBeUndefined();
    expect((await call("/knowledge/search", people.shown, "POST", { query: "rò nước bồn rửa" })).body.hidden).toBeUndefined();
    expect((await call("/analytics/ai-accuracy", people.shown)).body.hidden).toBeUndefined();
  });

  it("keeps assignment possible without ranking hints and does not leak AI risk through queues", async () => {
    const hiddenOptions = await call(`/cases/${record._id}/assignment-options`, people.hidden);
    expect(hiddenOptions.body.advisory).toBe(false);
    expect(hiddenOptions.body.options.map((option: any) => option.name)).toEqual(["agent"]);
    expect(hiddenOptions.body.options[0]).not.toHaveProperty("skillMatch");
    expect((await call(`/cases/${record._id}/assignment-options`, people.shown)).body.options[0].skillMatch).toBe(true);

    // The case is not overdue; only its AI risk score would put it in the at-risk queue.
    expect((await call("/cases?queue=at_risk", people.hidden)).body.cases).toHaveLength(0);
    expect((await call("/cases?queue=at_risk", people.shown)).body.cases.map((item: any) => item.code)).toEqual(["STUDY-1"]);
    const dashboard = await call("/dashboard", people.hidden);
    expect(dashboard.body.highRiskCases).toEqual([]);
  });

  it("blanks AI averages and AI export columns in analytics for the hidden account only", async () => {
    const categories = await call("/analytics/categories", people.hidden);
    expect(categories.body.categories.length).toBeGreaterThan(0);
    for (const row of categories.body.categories) expect(row).toMatchObject({ avgRisk: null, avgConfidence: null });
    expect((await call("/analytics/categories", people.shown)).body.categories.some((row: any) => row.avgRisk > 0)).toBe(true);
    for (const row of (await call("/analytics/team-performance", people.hidden)).body.agents) expect(row.avgRisk).toBeNull();

    const hiddenCsv = (await call("/analytics/export/csv", people.hidden)).body as string;
    expect(hiddenCsv).toContain("STUDY-1");
    expect(hiddenCsv).not.toMatch(/0\.91|0\.92/);
    expect((await call("/analytics/export/csv", people.shown)).body as string).toMatch(/0\.92/);
  });

  it("hides predicted-risk notifications but keeps breaches", async () => {
    const inbox = await call("/notifications", people.hidden);
    expect(inbox.body.notifications.map((item: any) => item.title)).toEqual(["STUDY-1 đã quá hạn SLA"]);
    expect(inbox.body.unreadCount).toBe(1);
    expect((await call("/notifications/unread-count", people.hidden)).body.count).toBe(1);
  });

  it("lets the hidden account triage and assign by hand while AI output stays stored", async () => {
    const triage = await call(`/cases/${record._id}`, people.hidden, "PATCH", { priority: "high", serviceKey: "water", assigneeId: String(people.agent._id) });
    expect(triage.status).toBe(200);
    expect(triage.body.case.ai).toEqual({ processingStatus: expect.any(String), reviewStatus: expect.stringMatching(/^(reviewed|pending)$/) });
    const stored = await models.CaseRecord.findById(record._id).lean<any>();
    expect(stored.priority).toBe("high");
    expect(String(stored.assigneeId)).toBe(String(people.agent._id));
    expect(stored.ai.classification).toBe("water");
    expect(stored.ai.riskScore).toBeCloseTo(0.92);
  });

  it("exposes the flag in the session payload of staff only", async () => {
    expect((await call("/auth/me", people.hidden)).body.user.aiSuggestionsHidden).toBe(true);
    expect((await call("/auth/me", people.shown)).body.user.aiSuggestionsHidden).toBe(false);
    await models.User.updateOne({ _id: people.resident._id }, { $set: { aiSuggestionsHidden: true } });
    expect((await call("/auth/me", people.resident)).body.user.aiSuggestionsHidden).toBe(false);
  });
  it("does not reveal agreement with AI through priority events or incident option scores", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { $push: { events: { type: "priority_changed", label: "Đổi ưu tiên → Cao (theo gợi ý AI)" } } });
    const detail = await call(`/cases/${record._id}`, people.hidden);
    expect(JSON.stringify(detail.body.case.events)).not.toContain("theo gợi ý AI");
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { propertyCode: "STUDY-A" } });
    const incident = await models.Incident.create({ organizationId: org._id, code: "STUDY-INC", title: "Water reports", team: people.hidden.team, propertyCode: "STUDY-A", caseIds: [record._id] });
    await models.CaseRecord.create({ organizationId: org._id, code: "STUDY-CANDIDATE", title: "Water candidate", description: "Water leak", category: "water", serviceKey: "water", team: people.hidden.team, propertyCode: "STUDY-A", requesterId: people.resident._id, requesterName: "resident", dueAt: new Date(Date.now()+3600000) });
    const options = await call(`/incidents/${incident._id}/options`, people.hidden);
    expect(options.status).toBe(200);
    expect(options.body.candidates).not.toHaveLength(0);
    expect(options.body.candidates.every((value: any) => value.score === null)).toBe(true);
  });
});

describe("switching the AI condition", () => {
  const toggle = (actor: any, target: any, body: Record<string, unknown>) => call(`/users/${target._id}/ai-visibility`, actor, "PATCH", body);
  const audits = (action: string) => models.AuditLog.countDocuments({ action });

  it("lets an organization admin switch a staff account and audits the transition without payload", async () => {
    const result = await toggle(people.admin, people.shown, { aiSuggestionsHidden: true });
    expect(result.status).toBe(200);
    expect(result.body.user).toMatchObject({ aiSuggestionsHidden: true, studyCode: "p02" });
    // Takes effect on the next request without signing in again.
    expect(Object.keys((await call(`/cases/${record._id}`, people.shown)).body.case.ai).sort()).toEqual(["processingStatus", "reviewStatus"]);
    const entry = await models.AuditLog.findOne({ action: "user.ai_visibility.change", resourceId: String(people.shown._id) }).lean<any>();
    expect(entry.changes).toEqual({ from: false, to: true });
    expect((await toggle(people.admin, people.shown, { aiSuggestionsHidden: false })).status).toBe(200);
    expect((await call(`/cases/${record._id}`, people.shown)).body.case.ai).toHaveProperty("classification");
    const users = await call("/users", people.admin);
    expect(users.body.users.find((user: any) => user.email === "hidden@study.test")).toMatchObject({ aiSuggestionsHidden: true, studyCode: "p01" });
    // Teammates see the colleague but not the code or condition; the account still sees its own.
    for (const viewer of [people.shown]) {
      const peer = (await call("/users", viewer)).body.users.find((user: any) => user.email === "hidden@study.test");
      expect(peer).toBeTruthy();
      expect(peer).not.toHaveProperty("studyCode");
      expect(peer).not.toHaveProperty("aiSuggestionsHidden");
    }
    expect((await call("/users", people.hidden)).body.users.find((user: any) => user.email === "hidden@study.test"))
      .toMatchObject({ aiSuggestionsHidden: true, studyCode: "p01" });
  });

  it("refuses managers, self-changes, other organizations, residents and duplicate codes", async () => {
    const deniedBefore = await audits("user.ai_visibility.denied");
    expect((await toggle(people.hidden, people.shown, { aiSuggestionsHidden: true })).status).toBe(403);
    expect((await toggle(people.hidden, people.hidden, { aiSuggestionsHidden: false })).status).toBe(403);
    expect((await toggle(people.admin, people.admin, { aiSuggestionsHidden: true })).status).toBe(403);
    expect(await audits("user.ai_visibility.denied")).toBe(deniedBefore + 3);
    expect((await toggle(people.outsider, people.hidden, { aiSuggestionsHidden: false })).status).toBe(404);
    expect((await toggle(people.admin, people.resident, { aiSuggestionsHidden: true })).status).toBe(422);
    expect((await toggle(people.admin, people.agent, { aiSuggestionsHidden: true, studyCode: "p01" })).status).toBe(409);
    expect((await toggle(people.admin, people.agent, { aiSuggestionsHidden: true, studyCode: "Nguyen" })).status).toBe(400);
    expect((await toggle(people.admin, people.agent, { aiSuggestionsHidden: true, extra: 1 })).status).toBe(400);
    expect((await models.User.findById(people.hidden._id).lean<any>()).aiSuggestionsHidden).toBe(true);
  });
});

describe("study handling records and export", () => {
  const makeCase = (code: string) => models.CaseRecord.create({ organizationId: org._id, code,
    title: "Private title", description: "Private resident description and phone 0901234567", serviceKey: "water", category: "water",
    requesterId: people.resident._id, requesterName: "Private resident", team: "Kỹ thuật điện nước", dueAt: new Date(Date.now() + 3600000),
    study: { scenarioGroup: "g1" }, ai: { classification: "water", suggestedPriority: "high", reviewStatus: "pending" } });

  it("records the first open and confirmation once, using the flag in force at each moment", async () => {
    const item = await makeCase("STUDY-TIMING");
    await models.User.updateOne({ _id: people.hidden._id }, { $set: { aiSuggestionsHidden: true } });
    await Promise.all([call(`/cases/${item._id}`, people.hidden), call(`/cases/${item._id}`, people.hidden)]);
    const first = await (models as any).CaseHandlingRecord.findOne({ userId: people.hidden._id, caseId: item._id }).lean();
    expect(first.firstOpenedAiHidden).toBe(true);
    expect(first.confirmedAt).toBeNull();
    await models.User.updateOne({ _id: people.hidden._id }, { $set: { aiSuggestionsHidden: false } });
    await call(`/cases/${item._id}`, people.hidden);
    expect((await (models as any).CaseHandlingRecord.findById(first._id).lean()).firstOpenedAt).toEqual(first.firstOpenedAt);
    expect((await call(`/cases/${item._id}`, people.hidden, "PATCH", { priority: "high" })).status).toBe(200);
    expect((await (models as any).CaseHandlingRecord.findById(first._id).lean()).confirmedAt).toBeNull();
    expect((await call(`/cases/${item._id}`, people.hidden, "PATCH", { serviceKey: "water", priority: "high" })).status).toBe(200);
    const confirmed = await (models as any).CaseHandlingRecord.findById(first._id).lean();
    expect(confirmed).toMatchObject({ confirmedAiHidden: false, finalCategory: "water", finalPriority: "high" });
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    await models.User.updateOne({ _id: people.hidden._id }, { $set: { aiSuggestionsHidden: true } });
    await call(`/cases/${item._id}`, people.hidden, "PATCH", { serviceKey: "water", priority: "urgent" });
    const again = await (models as any).CaseHandlingRecord.findById(first._id).lean();
    expect(again.confirmedAt).toEqual(confirmed.confirmedAt);
    expect(again.finalPriority).toBe("high");
    expect(await (models as any).CaseHandlingRecord.countDocuments({ userId: people.hidden._id, caseId: item._id })).toBe(1);
  });

  it("does not collect timings for non-study staff, residents or denied reads", async () => {
    const item = await makeCase("STUDY-NO-COLLECTION");
    expect((await call(`/cases/${item._id}`, people.agent)).status).toBe(200);
    expect((await call(`/cases/${item._id}`, people.resident)).status).toBe(200);
    expect((await call(`/cases/${item._id}`, people.outsider)).status).toBe(404);
    expect(await (models as any).CaseHandlingRecord.countDocuments({ caseId: item._id })).toBe(0);
  });

  it("counts distinct participant-created jobs and attributes removed links to their original author", async () => {
    const item = await makeCase("STUDY-COUNTS");
    await models.CaseRecord.updateOne({ _id: item._id }, { $set: { propertyCode: "STUDY-A" } });
    await call(`/cases/${item._id}`, people.hidden);
    await call(`/cases/${item._id}`, people.hidden, "PATCH", { serviceKey: "water", priority: "high" });
    const { RentalAsset } = await import("../src/models/rental.js");
    await RentalAsset.create({ organizationId: org._id, propertyCode: "STUDY-A", code: "STUDY-PUMP", name: "Pump", category: "water" });
    const body = { title: "Inspect pump", assetCode: "STUDY-PUMP", caseCode: item.code, assigneeId: String(people.agent._id), dueAt: new Date(Date.now() + 3600000).toISOString() };
    expect((await call("/rental/tasks/study-repair-key-0001", people.hidden, "PUT", body)).status).toBe(200);
    expect((await call("/rental/tasks/study-repair-key-0001", people.hidden, "PUT", body)).status).toBe(200);
    expect((await call("/rental/tasks/study-repair-key-0002", people.hidden, "PUT", body)).status).toBe(200);
    expect((await call("/rental/tasks/study-repair-key-0003", people.shown, "PUT", body)).status).toBe(200);
    expect((await call("/rental/tasks/study-repair-key-0004", people.hidden, "PUT", { ...body, caseCode: "FOREIGN-CASE" })).status).toBe(422);
    const inc1 = new mongoose.Types.ObjectId(), inc2 = new mongoose.Types.ObjectId();
    for (const [index, actor, action, resourceId] of [
      [0, people.hidden, "incident.link", inc1], [1, people.admin, "incident.unlink", inc1],
      [2, people.shown, "incident.link", inc2], [3, people.hidden, "incident.unlink", inc2]
    ] as const) await models.AuditLog.create({ organizationId: org._id, actorId: actor._id, actorName: actor.name, actorRole: actor.role,
      action, resource: "Incident", resourceId, changes: { caseId: String(item._id) }, createdAt: new Date(Date.now() - (10-index) * 1000) });
    const result = await call("/study/export.csv?from=2020-01-01&to=2099-12-31&participants=p01", people.admin);
    const rows = parse(result.body, { columns: true, bom: true });
    expect(rows.find((row: any) => row.case_code === item.code)).toMatchObject({ duplicate_jobs: "1", false_links: "1" });
  });

  it("does not invent a start time when confirmation precedes opening", async () => {
    const item = await makeCase("STUDY-UNOPENED");
    await call(`/cases/${item._id}`, people.hidden, "PATCH", { serviceKey: "water", priority: "high" });
    const handling = await (models as any).CaseHandlingRecord.findOne({ caseId: item._id }).lean();
    expect(handling.firstOpenedAt).toBeNull();
    expect(handling.confirmedAt).toBeInstanceOf(Date);
    const result = await call("/study/export.csv?from=2020-01-01&to=2099-12-31", people.admin);
    expect(result.body).not.toContain("STUDY-UNOPENED");
  });

  it("exports the timing contract without PII, uses confirmation condition and neutralises formulas", async () => {
    const item = await makeCase("=STUDY-EXPORT");
    await call(`/cases/${item._id}`, people.hidden);
    await call(`/cases/${item._id}`, people.hidden, "PATCH", { serviceKey: "water", priority: "high" });
    await models.User.updateOne({ _id: people.hidden._id }, { $set: { aiSuggestionsHidden: false } });
    await models.CaseRecord.updateOne({ _id: item._id }, { $set: { "ai.classification": "=1+1" } });
    const response = await fetch(`${base}/api/study/export.csv?from=2020-01-01&to=2099-12-31&participants=p01`, { headers: { Authorization: `Bearer ${bearer(people.admin)}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const csv = await response.text();
    const rows = parse(csv, { columns: true, bom: true });
    expect(Object.keys(rows[0])).toEqual(["participant", "scenario_group", "condition", "started_at", "confirmed_at", "classification_correct", "duplicate_jobs", "false_links", "case_code", "final_category", "final_priority", "ai_category", "ai_priority"]);
    const row = rows.find((value: any) => value.case_code === "'=STUDY-EXPORT");
    expect(row).toMatchObject({ participant: "p01", scenario_group: "g1", condition: "manual", classification_correct: "", final_category: "water", final_priority: "high", ai_category: "'=1+1" });
    expect(row.started_at).toMatch(/\+07:00$/);
    expect(row.confirmed_at).toMatch(/\+07:00$/);
    expect(csv).not.toMatch(/Private|0901234567|@study\.test|Ống nước/);
    expect(rows.every((value: any) => value.participant === "p01")).toBe(true);
    const outsider = await call("/study/export.csv?from=2020-01-01&to=2099-12-31", people.outsider);
    expect(parse(outsider.body, { columns: true, bom: true })).toHaveLength(0);
    expect((await call("/study/export.csv", people.hidden)).status).toBe(403);
    expect((await call("/study/export.csv", people.resident)).status).toBe(403);
    expect((await call("/study/export.csv?from=2026-02-31", people.admin)).status).toBe(400);
    expect((await call("/study/export.csv?from=2026-12-31&to=2026-01-01", people.admin)).status).toBe(400);
  });
});
