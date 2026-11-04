import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { buildReviewedTrainingCsv, redactTrainingText } from "../../src/services/trainingDataset.js";
import { addBusinessHours, organizationCalendar } from "../../src/services/workingHours.js";

const secret = "audit-isolated-secret-not-for-deployment";
type UserFixture = { _id: mongoose.Types.ObjectId; organizationId: mongoose.Types.ObjectId; name: string };
let database: MongoMemoryServer;
let server: Server;
let base: string;
let models: typeof import("../../src/models.js");
let recommendations: typeof import("../../src/models/recommendation.js");
let org: { _id: mongoose.Types.ObjectId };
let student: UserFixture, agent: UserFixture, colleague: UserFixture, manager: UserFixture, outsider: UserFixture;
let record: { _id: mongoose.Types.ObjectId };

async function request(path: string, user: UserFixture | null, method = "GET", body?: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${jwt.sign({ id: String(user._id), organizationId: String(user.organizationId), tokenVersion: 0 }, secret, { expiresIn: "1h" })}`;
  const response = await fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("MONGODB_URI", database.getUri());
  vi.stubEnv("MONGODB_DB", "caseflow_audit_isolated");
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("AUTO_SEED", "false");
  vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "10000");
  vi.stubEnv("AI_SERVICE_URL", "http://127.0.0.1:1");
  models = await import("../../src/models.js");
  recommendations = await import("../../src/models/recommendation.js");
  const { app } = await import("../../src/app.js");
  await mongoose.connect(database.getUri(), { dbName: "caseflow_audit_isolated" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(done => server.once("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing audit port");
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  org = await models.Organization.create({ name: "Audit fixture", slug: "audit-fixture" });
  const other = await models.Organization.create({ name: "Other fixture", slug: "other-fixture" });
  [student, agent, colleague, manager, outsider] = await models.User.create([
    { name: "Student", email: "s@audit.invalid", role: "requester", organizationId: org._id },
    { name: "Agent", email: "a@audit.invalid", role: "agent", team: "IT", organizationId: org._id },
    { name: "Colleague", email: "b@audit.invalid", role: "agent", team: "IT", organizationId: org._id },
    { name: "Manager", email: "m@audit.invalid", role: "manager", organizationId: org._id },
    { name: "Other admin", email: "o@audit.invalid", role: "org_admin", organizationId: other._id }
  ].map(user => ({ ...user, passwordHash: "unused-by-token-auth-tests" })));
  await models.ServiceDefinition.create({ organizationId: org._id, key: "it_access", name: "IT", category: "it_access", team: "IT", slaHours: 8 });
  record = await models.CaseRecord.create({ organizationId: org._id, code: "AUDIT-01", title: "Audit case", description: "Isolated audit fixture", serviceKey: "it_access", category: "it_access", requesterId: student._id, requesterName: student.name, team: "IT", assigneeId: agent._id, assigneeName: agent.name, status: "in_progress", dueAt: new Date(Date.now() + 86400000), ai: { reviewStatus: "confirmed" } });
});

afterAll(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
  await mongoose.disconnect();
  if (database) await database.stop();
  vi.unstubAllEnvs();
});

describe("authentication and resource boundaries", () => {
  it.each(["/cases", "/knowledge", "/users", "/system/status", "/recommendations/metrics", "/notifications"])("rejects anonymous reads of %s", async path => {
    expect((await request(path, null)).status).toBe(401);
  });
  it.each(["", "/attachments", "/assignment-options"])("hides another tenant's case%s", async suffix => {
    expect((await request(`/cases/${record._id}${suffix}`, outsider)).status).toBe(404);
  });
  it("rejects requester case reassignment", async () => {
    expect((await request(`/cases/${record._id}`, student, "PATCH", { assigneeId: String(colleague._id) })).status).toBe(403);
  });
  it("allows managers to reassign within the organization", async () => {
    expect((await request(`/cases/${record._id}`, manager, "PATCH", { assigneeId: String(colleague._id) })).status).toBe(200);
  });
  it("F03: rejects an agent taking over a colleague's assigned case", async () => {
    expect((await request(`/cases/${record._id}`, colleague, "PATCH", { assigneeId: String(colleague._id) })).status).toBe(403);
  });
});

describe("SLA and lifecycle contracts", () => {
  it("F01: counts paused cases resolved before their stored deadline as on time", async () => {
    const start = new Date(Date.now() - 7 * 86400000);
    start.setUTCHours(1, 0, 0, 0);
    const calendar = organizationCalendar();
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "resolved", slaStartedAt: start, createdAt: start, slaPausedHours: 8, dueAt: addBusinessHours(start, 16, calendar), resolvedAt: addBusinessHours(start, 12, calendar) } });
    const response = await request("/analytics/sla-compliance", manager);
    expect(response.status).toBe(200);
    expect(response.body.overall).toMatchObject({ total: 1, onTime: 1, breached: 0 });
  });
  it("F02: keeps historical compliance after a catalog SLA change", async () => {
    const start = new Date(Date.now() - 7 * 86400000);
    start.setUTCHours(1, 0, 0, 0);
    const calendar = organizationCalendar();
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "resolved", slaStartedAt: start, createdAt: start, dueAt: addBusinessHours(start, 8, calendar), resolvedAt: addBusinessHours(start, 6, calendar) } });
    await models.ServiceDefinition.updateOne({ organizationId: org._id, key: "it_access" }, { $set: { slaHours: 2 } });
    expect((await request("/analytics/sla-compliance", manager)).body.overall.onTime).toBe(1);
  });
  it("F02: confirming the existing service preserves its committed deadline", async () => {
    const before = await models.CaseRecord.findById(record._id).lean();
    await models.ServiceDefinition.updateOne({ organizationId: org._id, key: "it_access" }, { $set: { slaHours: 2 } });
    const response = await request(`/cases/${record._id}`, agent, "PATCH", { serviceKey: "it_access" });
    expect(response.status).toBe(200);
    const after = await models.CaseRecord.findById(record._id).lean();
    expect(after!.dueAt.getTime()).toBe(before!.dueAt.getTime());
  });
  it("F02: the background checker preserves deadlines after catalog changes", async () => {
    const before = await models.CaseRecord.findById(record._id).lean();
    await models.ServiceDefinition.updateOne({ organizationId: org._id, key: "it_access" }, { $set: { slaHours: 2 } });
    const { runSlaCheck } = await import("../../src/jobs/slaChecker.js");
    await runSlaCheck();
    const after = await models.CaseRecord.findById(record._id).lean();
    expect(after!.dueAt.getTime()).toBe(before!.dueAt.getTime());
  });
  it("F08: excludes paused waiting cases from the system overdue counter", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "waiting", slaPausedAt: new Date(), dueAt: new Date(0) } });
    const queue = await request("/cases?queue=overdue", manager);
    const status = await request("/system/status", manager);
    expect(queue.body.total).toBe(0);
    expect(status.body.counts.overdueCases).toBe(0);
  });
  it("F10: returns reopened cases with inactive assignees to triage", async () => {
    await models.User.updateOne({ _id: agent._id }, { $set: { active: false } });
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "resolved", resolvedAt: new Date() } });
    const response = await request(`/cases/${record._id}/reopen`, student, "POST", {});
    expect(response.status).toBe(200);
    expect(response.body.case).toMatchObject({ status: "triaged", assigneeId: null });
    expect(await models.Notification.countDocuments({ organizationId: org._id, userId: manager._id, relatedCaseId: record._id })).toBe(1);
  });
  it("does not allow another tenant to reopen a case", async () => {
    expect((await request(`/cases/${record._id}/reopen`, outsider, "POST", {})).status).toBe(403);
  });
});

describe("recommendation and notification accounting", () => {
  it("F09: retains pending suggestions when older suggestions receive new feedback", async () => {
    const { Recommendation, RecommendationFeedback } = recommendations;
    const old = await Recommendation.create({ organizationId: org._id, userId: manager._id, createdAt: new Date(Date.now() - 40 * 86400000), expiresAt: new Date(Date.now() + 60000), items: [{ action: "assign", reason: "Old", decision: "accepted" }] });
    await Recommendation.create({ organizationId: org._id, userId: manager._id, expiresAt: new Date(Date.now() + 60000), items: [{ action: "assign", reason: "Pending" }] });
    await RecommendationFeedback.create({ organizationId: org._id, userId: manager._id, recommendationId: old._id, itemId: old.items[0]._id, action: "assign", decision: "accepted", decidedAt: new Date() });
    expect((await request("/recommendations/metrics", manager)).body.pending).toBe(1);
  });
  it("does not expose recommendation metrics to requesters", async () => {
    expect((await request("/recommendations/metrics", student)).status).toBe(403);
  });
  it("notification total reflects the active unread filter", async () => {
    await models.Notification.create([false, true].map(read => ({ organizationId: org._id, userId: student._id, type: "system", title: "Audit notification", read })));
    const response = await request("/notifications?unread=true", student);
    expect(response.body.notifications).toHaveLength(1);
    expect(response.body.total).toBe(1);
  });
  it("rejects non-finite notification offsets as invalid input", async () => {
    expect((await request("/notifications?skip=Infinity", student)).status).toBe(400);
  });
});

describe("training export contracts", () => {
  it.each(["B22DCCN019", "B21DCCN123"])("F04: removes PTIT identifier %s", id => {
    expect(redactTrainingText(`MSSV ${id}`)).not.toContain(id);
  });
  it("F05: does not expose a spreadsheet formula in a reviewed training export", () => {
    const csv = buildReviewedTrainingCsv([{ title: '=1+N("', description: '")', category: "it_access", ai: { reviewStatus: "confirmed" } }]);
    expect(csv).not.toContain('\n"=');
  });
  it("does not export cases with unreviewed labels", () => {
    const csv = buildReviewedTrainingCsv([{ title: "Unreviewed fixture", description: "Sensitive draft", category: "it_access" }]);
    expect(csv).not.toContain("Unreviewed fixture");
  });
});
