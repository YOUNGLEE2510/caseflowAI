import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";

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
  server?.close();
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
    expect(dashboard.body.highRiskCases ?? []).toHaveLength(0);
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
