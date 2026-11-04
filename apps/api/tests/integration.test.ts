import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

const cloudObjects = vi.hoisted(() => new Map<string, Buffer>());
const cloudFaults = vi.hoisted(() => ({ uploadAfterWrite: false, deletion: false }));
vi.mock("../src/services/cloudinaryStorage.js", () => ({
  storeCloudinaryObject: async (key: string, body: Buffer) => { cloudObjects.set(key, Buffer.from(body)); if (cloudFaults.uploadAfterWrite) throw new Error("Simulated lost upload acknowledgement"); },
  deleteCloudinaryObject: async (key: string) => { if (cloudFaults.deletion) throw new Error("Simulated storage outage"); cloudObjects.delete(key); },
  getCloudinaryObjectStream: async (key: string) => {
    const { Readable } = await import("node:stream");
    return Readable.from([cloudObjects.get(key)!]);
  }
}));

vi.mock("../src/services/aiClient.js", () => ({
  fallbackClassify: () => ({ modelVersion: "fallback-v1", label: "general_support", confidence: 0.3, summary: "Account support", extracted: {}, topCandidates: [], provider: "fallback" }),
  classifyText: async () => ({ modelVersion: "test-model-v2", label: "it_access", confidence: 0.8, summary: "Account support", extracted: { location: "Building A" }, topCandidates: [], provider: "test" }),
  findSimilarCases: async (_text: string, cases: any[]) => cases.map((item) => ({ id: item.id, title: item.title, score: 0.9 })),
  predictSla: async () => ({ riskScore: 0.3, factors: [] }),
  retrieveKnowledge: async (_query: string, articles: any[]) => ({ answer: "Source retrieval", citations: articles })
}));
vi.mock("../src/services/microsoftOAuth.js", () => ({
  verifyMicrosoftIdentity: async () => ({ objectId: "22222222-2222-4222-8222-222222222222", tenantId: "11111111-1111-4111-8111-111111111111" })
}));

const secret = "isolated-test-secret-not-for-production";
let database: MongoMemoryServer;
let server: Server;
let base: string;
let uploads: string;
let models: typeof import("../src/models.js");
let org: any, requester: any, outsider: any, agent: any, admin: any, record: any;

function token(user: any) {
  return jwt.sign({ id: String(user._id), organizationId: String(user.organizationId), tokenVersion: user.tokenVersion || 0 }, secret, { expiresIn: "1h" });
}

async function request(path: string, user: any = requester, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${typeof user === "string" ? user : token(user)}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() as any };
}

beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  uploads = await mkdtemp(join(tmpdir(), "caseflow-test-"));
  vi.stubEnv("MONGODB_URI", database.getUri());
  vi.stubEnv("MONGODB_DB", "caseflow_isolated_test");
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("AUTO_SEED", "false");
  vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "10000");
  vi.stubEnv("OAUTH_RATE_LIMIT_PER_MINUTE", "10000");
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("MICROSOFT_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("UPLOAD_DIR", uploads);
  const { app } = await import("../src/app.js");
  models = await import("../src/models.js");
  await mongoose.connect(database.getUri(), { dbName: "caseflow_isolated_test" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
}, 180000);

beforeEach(async () => {
  cloudObjects.clear(); cloudFaults.uploadAfterWrite = false; cloudFaults.deletion = false;
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  org = await models.Organization.create({ name: "Test University", slug: "test-university" });
  const otherOrg = await models.Organization.create({ name: "Other University", slug: "other-university" });
  const passwordHash = await bcrypt.hash("TestPassword123!", 4);
  [requester, outsider, agent, admin] = await models.User.create([
    { organizationId: org._id, name: "Student", email: "student@test.local", passwordHash, role: "requester" },
    { organizationId: otherOrg._id, name: "Other", email: "other@test.local", passwordHash, role: "org_admin" },
    { organizationId: org._id, name: "Agent", email: "agent@test.local", passwordHash, role: "agent", team: "IT" },
    { organizationId: org._id, name: "Admin", email: "admin@test.local", passwordHash, role: "org_admin" }
  ]);
  await models.ServiceDefinition.create([
    { organizationId: org._id, key: "general_support", name: "General", category: "general_support", team: "IT", slaHours: 24 },
    { organizationId: org._id, key: "it_access", name: "IT", category: "it_access", team: "IT", slaHours: 24, requiredFields: ["Student ID"] }
  ]);
  record = await models.CaseRecord.create({ organizationId: org._id, code: "TEST-01", title: "Test request", description: "A test request for help", serviceKey: "it_access", category: "it_access", requesterId: requester._id, requesterName: requester.name, team: "IT", dueAt: new Date(Date.now() + 3600000) });
});

describe("personnel boundaries and leave workflow", () => {
  it("scopes incomplete-upload retry jobs and never releases quota directly from the retry endpoint", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { attachmentCount: 1, attachmentBytes: 100 }, $push: { attachmentReservations: { filename: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf", size: 100, storageProvider: "cloudinary", expiresAt: new Date(Date.now() - 1000) } } });
    const jobs = await request("/system/jobs", admin);
    expect(jobs.body.jobs).toContainEqual({ caseId: String(record._id), code: record.code, kind: "upload" });
    expect((await request(`/system/jobs/${record._id}/retry`, agent, "POST", { kind: "upload" })).status).toBe(403);
    expect((await request(`/system/jobs/${record._id}/retry`, outsider, "POST", { kind: "upload" })).status).toBe(409);
    expect((await request(`/system/jobs/${record._id}/retry`, admin, "POST", { kind: "upload" })).status).toBe(200);
    expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(1);
    expect(JSON.stringify(jobs.body)).not.toContain("filename");
  });
  it("uses the current stored deadline for personnel SLA rather than a historical breach flag", async () => {
    const now = new Date();
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { assigneeId: agent._id, status: "resolved", resolvedAt: now, dueAt: new Date(now.getTime() + 3600000), slaBreached: true } });
    const result = await request("/personnel", admin);
    const member = result.body.members.find((item: { _id: string }) => item._id === String(agent._id));
    expect(member.quality.total).toBe(1);
    expect(member.quality.onTime).toBe(1);
  });
  it("paginates staff and leave history without leaking tenants or account secrets", async () => {
    const first = await request("/personnel?limit=1&page=1", admin);
    const second = await request("/personnel?limit=1&page=2", admin);
    expect(first.body.total).toBe(2);
    expect(first.body.members).toHaveLength(1);
    expect(first.body.members[0]._id).not.toBe(second.body.members[0]._id);
    expect((await request("/personnel?limit=101", admin)).status).toBe(400);
    expect((await request("/personnel?q=Agent", admin)).body.total).toBe(1);
    expect((await request("/personnel?q=.*", admin)).body.total).toBe(0);
    const leaves = ["2027-01-01", "2027-02-01", "2027-03-01"].map(start => ({ start, end: start, reason: "Isolated test leave", status: "pending" }));
    await models.User.updateOne({ _id: agent._id }, { $set: { leaveRequests: leaves } });
    await models.User.updateOne({ _id: outsider._id }, { $set: { leaveRequests: leaves } });
    const history = await request("/personnel/leaves?limit=1&page=2", admin);
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(3);
    expect(history.body.leaves).toHaveLength(1);
    expect(history.body.leaves[0].start).toBe("2027-02-01");
    expect(history.body.leaves[0].employeeId).toBe(String(agent._id));
    expect((await request("/personnel/leaves", agent)).body.total).toBe(3);
    expect(JSON.stringify(history.body)).not.toContain("passwordHash");
  });
  it("rejects latent HR privileges on requesters and clears delegation on demotion", async () => {
    expect((await request(`/users/${requester._id}`, admin, "PATCH", { personnelManager: true })).status).toBe(422);
    await models.User.updateOne({ _id: agent._id }, { $set: { personnelManager: true } });
    expect((await request(`/users/${agent._id}`, admin, "PATCH", { role: "requester" })).status).toBe(200);
    expect((await models.User.findById(agent._id)).personnelManager).toBe(false);
    expect((await request("/personnel", agent)).status).toBe(401);
    const demoted = await models.User.findById(agent._id);
    expect((await request("/personnel", demoted)).status).toBe(403);
  });
  it("deduplicates delivery retries and keeps internal notes out of requester notifications", async () => {
    const { processCaseDeliveries } = await import("../src/jobs/caseDelivery.js");
    const { EmailOutbox } = await import("../src/services/emailOutbox.js");
    const eventId = new mongoose.Types.ObjectId();
    await models.CaseRecord.updateOne({ _id: record._id }, { $push: { deliveryEvents: { _id: eventId, kind: "updated", actorId: agent._id, requesterId: requester._id, team: "IT", status: "in_progress", internal: false } } });
    await processCaseDeliveries();
    const notifications = await models.Notification.countDocuments({ userId: requester._id });
    expect(notifications).toBe(1);
    expect(await EmailOutbox.countDocuments()).toBe(1);
    await models.CaseRecord.updateOne({ _id: record._id, "deliveryEvents._id": eventId }, { $set: { "deliveryEvents.$.completedAt": null } });
    await processCaseDeliveries();
    expect(await models.Notification.countDocuments({ userId: requester._id })).toBe(notifications);
    expect(await EmailOutbox.countDocuments()).toBe(1);
    await models.CaseRecord.updateOne({ _id: record._id }, { $push: { deliveryEvents: { kind: "commented", actorId: agent._id, requesterId: requester._id, team: "IT", status: "in_progress", internal: true } } });
    await processCaseDeliveries();
    expect(await models.Notification.countDocuments({ userId: requester._id })).toBe(notifications);
    expect(await EmailOutbox.countDocuments()).toBe(1);
  });
  it("scopes failed-job retries and does not rerun reviewed AI", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { "ai.processingStatus": "failed", "ai.reviewStatus": "pending" } });
    expect((await request("/system/jobs", agent)).status).toBe(403);
    expect((await request(`/system/jobs/${record._id}/retry`, outsider, "POST", { kind: "triage" })).status).toBe(409);
    expect((await request(`/system/jobs/${record._id}/retry`, admin, "POST", { kind: "triage" })).status).toBe(200);
    expect((await request(`/system/jobs/${record._id}/retry`, admin, "POST", { kind: "triage" })).status).toBe(409);
  });
  it("lets delegated HR manage personnel without provisioning accounts or escalating access", async () => {
    await models.User.updateOne({ _id: agent._id }, { $set: { personnelManager: true } });
    expect((await request(`/personnel/${admin._id}`, agent, "PATCH", { title: "Updated job title" })).status).toBe(200);
    expect((await request("/users", agent, "POST", { name: "Forbidden" })).status).toBe(403);
    expect((await request(`/users/${agent._id}`, agent, "PATCH", { role: "org_admin" })).status).toBe(403);
    expect((await request(`/personnel/${outsider._id}`, agent, "PATCH", { title: "Forbidden" })).status).toBe(404);
    expect((await request(`/personnel/${agent._id}`, agent, "PATCH", { personnelManager: true })).status).toBe(400);
  });
  it("does not expose future or expired published versions to requesters", async () => {
    for (const expired of [false, true]) {
      const article = await models.KnowledgeArticle.create({ organizationId: org._id, title: "Visibility fixture", content: "Test only", sourceLabel: "Fixture", category: "it_access", status: "published", version: "1.0", effectiveAt: new Date(Date.now() + (expired ? -172800000 : 86400000)), expiresAt: expired ? new Date(Date.now() - 86400000) : null });
      expect((await request(`/knowledge/${article._id}/versions/1.0`, requester)).status).toBe(404);
      expect((await request(`/knowledge/${article._id}/versions/1.0`, admin)).status).toBe(200);
    }
  });
  it("restricts access, protects account fields and scopes employees by tenant", async () => {
    expect((await request("/personnel", requester)).status).toBe(403);
    expect((await request(`/personnel/${agent._id}`, outsider, "PATCH", { title: "Changed" })).status).toBe(404);
    expect((await request(`/personnel/${agent._id}`, admin, "PATCH", { role: "org_admin" })).status).toBe(400);
    const own = await request("/personnel", agent);
    expect(own.body.members.map((member: { _id: string }) => member._id)).toEqual([String(agent._id)]);
    expect(JSON.stringify(own.body)).not.toContain("passwordHash");
  });
  it("supports review, overlap protection, cancellation and availability", async () => {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const body = { start: date, end: date, reason: "Personal appointment" };
    const created = await request("/personnel/leaves", agent, "POST", body);
    expect(created.status).toBe(201);
    expect((await request("/personnel/leaves", agent, "POST", body)).status).toBe(409);
    const path = `/personnel/${agent._id}/leaves/${created.body.id}`;
    expect((await request(path, agent, "PATCH", { status: "approved" })).status).toBe(403);
    expect((await request(path, outsider, "PATCH", { status: "approved" })).status).toBe(409);
    expect((await request(path, admin, "PATCH", { status: "approved" })).status).toBe(200);
    expect((await request(path, admin, "PATCH", { status: "rejected", reviewNote: "Not applicable" })).status).toBe(409);
    const options = await request(`/cases/${record._id}/assignment-options`, admin);
    expect(options.body.options).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: String(agent._id) })]));
    expect((await request(path, agent, "PATCH", { status: "cancelled" })).status).toBe(409);
    const stored = await models.User.findById(agent._id);
    expect(String(stored.leaveRequests[0].reviewedBy)).toBe(String(admin._id));
    const future = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const pending = await request("/personnel/leaves", agent, "POST", { ...body, start: future, end: future });
    expect(pending.status).toBe(201);
    expect((await request(`/personnel/${agent._id}/leaves/${pending.body.id}`, agent, "PATCH", { status: "cancelled" })).status).toBe(200);
  });
  it("only lets a manager change staff schedules within their own team", async () => {
    const manager = await models.User.create({ organizationId: org._id, name: "Manager", email: "manager@test.local", passwordHash: "unused", role: "manager", team: "Other" });
    const schedule = { workingDays: [1, 3, 5], workStart: "09:00", workEnd: "16:00" };
    expect((await request(`/personnel/${agent._id}/schedule`, manager, "PATCH", schedule)).status).toBe(404);
    expect((await request(`/personnel/${agent._id}/schedule`, agent, "PATCH", schedule)).status).toBe(403);
    expect((await request(`/personnel/${agent._id}/schedule`, admin, "PATCH", schedule)).status).toBe(200);
    expect((await models.User.findById(agent._id)).workingDays).toEqual([1,3,5]);
  });
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
  await mongoose.disconnect();
  if (database) await database.stop();
  if (uploads) {
    if (dirname(resolve(uploads)) !== resolve(tmpdir()) || !basename(uploads).startsWith("caseflow-test-")) throw new Error("Unexpected test cleanup path");
    await rm(uploads, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("service completion boundaries", () => {
  it("queues encrypted status emails without including private case content", async () => {
    const { EmailOutbox } = await import("../src/services/emailOutbox.js");
    const updated = await request(`/cases/${record._id}`, agent, "PATCH", { confirmAi: true, assigneeId: String(agent._id), status: "in_progress" });
    expect(updated.status).toBe(200);
    expect(await EmailOutbox.countDocuments({ kind: "email" })).toBe(1);
    const resolved = await request(`/cases/${record._id}`, agent, "PATCH", { status: "resolved", resolutionNote: "Verified the issue has been resolved." });
    expect(resolved.status).toBe(200);
    const jobs = await EmailOutbox.find({ kind: "email" }).lean<Array<{ payload: string }>>();
    expect(jobs).toHaveLength(2);
    expect(jobs.every(job => !job.payload.includes(requester.email) && !job.payload.includes("Verified the issue"))).toBe(true);
  });
  it("emails public staff replies but never internal notes", async () => {
    const { EmailOutbox } = await import("../src/services/emailOutbox.js");
    expect((await request(`/cases/${record._id}/comments`, agent, "POST", { body: "Internal operational note", internal: true })).status).toBe(201);
    expect(await EmailOutbox.countDocuments({ kind: "email" })).toBe(0);
    expect((await request(`/cases/${record._id}/comments`, agent, "POST", { body: "Please check the updated guidance", internal: false })).status).toBe(201);
    expect(await EmailOutbox.countDocuments({ kind: "email" })).toBe(1);
  });
  it("paginates knowledge without exposing another organization or drafts", async () => {
    const article = { organizationId: org._id, title: "Published guide", content: "Verified support guidance", category: "it_access", sourceLabel: "School", status: "published", effectiveAt: new Date(0) };
    await models.KnowledgeArticle.create([{ ...article, title: "First" }, { ...article, title: "Second" }, { ...article, status: "draft" }, { ...article, organizationId: outsider.organizationId }]);
    const first = await request("/knowledge?limit=1&page=1");
    const second = await request("/knowledge?limit=1&page=2");
    expect(first.status).toBe(200);
    expect(first.body.total).toBe(2);
    expect(first.body.articles).toHaveLength(1);
    expect(first.body.articles[0]._id).not.toBe(second.body.articles[0]._id);
    expect((await request("/knowledge?limit=10000")).status).toBe(400);
  });
  it("does not audit each case read", async () => {
    await request(`/cases/${record._id}`);
    await request(`/cases/${record._id}`);
    expect(await models.AuditLog.countDocuments({ action: "case.view" })).toBe(0);
  });
  it("requires admin permission and confirmation for CSV import", async () => {
    const csv = "name,email,role,team\nNew Student,newstudent@example.com,requester,";
    expect((await request("/users/import", requester, "POST", { csv })).status).toBe(403);
    const preview = await request("/users/import", admin, "POST", { csv });
    expect(preview.status).toBe(200);
    expect(await models.User.exists({ email: "newstudent@example.com" })).toBeNull();
    const imported = await request("/users/import", admin, "POST", { csv, confirm: true });
    expect(imported.status).toBe(200);
    expect(imported.body.results[0].status).toBe("created");
    const user = await models.User.findOne({ email: "newstudent@example.com" });
    expect(user.mustChangePassword).toBe(true);
    expect(String(user.organizationId)).toBe(String(org._id));
    const retry = await request("/users/import", admin, "POST", { csv, confirm: true });
    expect(retry.body.results[0].status).toBe("exists");
  });
  it("keeps the metrics endpoint disabled without its private token", async () => {
    const previous = process.env.METRICS_TOKEN;
    try {
      delete process.env.METRICS_TOKEN;
      expect((await fetch(`${base}/internal/metrics`)).status).toBe(404);
      process.env.METRICS_TOKEN = "isolated-metrics-token";
      expect((await fetch(`${base}/internal/metrics`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(404);
      const allowed = await fetch(`${base}/internal/metrics`, { headers: { Authorization: "Bearer isolated-metrics-token" } });
      expect(allowed.status).toBe(200);
      expect(await allowed.text()).toContain("# TYPE caseflow_ai_requests_total counter");
    } finally {
      if (previous === undefined) delete process.env.METRICS_TOKEN;
      else process.env.METRICS_TOKEN = previous;
    }
  });
});

describe("indexed search and duplicate merging", () => {
  async function duplicate(extra: Record<string, unknown> = {}) {
    return models.CaseRecord.create({ organizationId: org._id, code: `DUP-${randomBytes(6).toString("hex")}`,
      title: "Duplicate request", description: "Repeated account support request", serviceKey: "it_access", category: "it_access",
      requesterId: requester._id, requesterName: requester.name, team: "IT", dueAt: new Date(Date.now() + 3600000), ...extra });
  }
  it("finds unaccented word prefixes through the compound search index", async () => {
    record.title = "Không kết nối Wi-Fi"; record.requesterName = "Nguyễn Đức Anh"; await record.save();
    expect((await request("/cases?search=ket%20no")).body.total).toBe(1);
    expect((await request("/cases?search=duc%20an")).body.total).toBe(1);
    expect((await request("/cases?search=.*")).body.total).toBe(0);
    expect((await request("/cases?search=ket", outsider)).body.total).toBe(0);
    const fixtures = Array.from({ length: 150 }, (_, index) => ({ organizationId: org._id, code: `NOISE-${index}`,
      title: "Unrelated fixture", description: "Noise for index verification", serviceKey: "it_access", category: "it_access",
      requesterId: requester._id, requesterName: "Other fixture", team: "IT", dueAt: new Date() }));
    await models.CaseRecord.insertMany(fixtures);
    await models.CaseRecord.init();
    const plan = await models.CaseRecord.find({ organizationId: org._id, searchTokens: { $all: ["ket"] } }).explain("executionStats");
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain("case_search_prefix_org");
    expect(plan.executionStats.totalDocsExamined).toBeLessThan(5);
  });
  it("backfills old cases idempotently without changing business timestamps", async () => {
    const before = record.updatedAt.getTime();
    await models.CaseRecord.collection.updateOne({ _id: record._id }, { $unset: { searchTokens: "", searchVersion: "" } });
    const { ensureCaseSearchIndex } = await import("../src/services/caseSearchMigration.js");
    await ensureCaseSearchIndex(); await ensureCaseSearchIndex();
    const current = await models.CaseRecord.findById(record._id).select("+searchTokens +searchVersion");
    expect(current.searchTokens).toContain("test");
    expect(current.searchVersion).toBe(1);
    expect(current.updatedAt.getTime()).toBe(before);
  });
  it("merges once, retains original private content and prevents reopening the duplicate", async () => {
    const source = await duplicate({ comments: [{ authorId: agent._id, authorName: agent.name, body: "Private staff context", internal: true }] });
    const body = { targetId: String(record._id), reason: "duplicate_submission" };
    const merged = await request(`/cases/${source._id}/merge`, admin, "POST", body);
    expect(merged.status).toBe(200);
    expect(merged.body.case).toMatchObject({ status: "closed", mergedIntoId: String(record._id), resolvedAt: null });
    expect(merged.body.case.comments).toHaveLength(1);
    expect((await request(`/cases/${source._id}/merge`, admin, "POST", body)).body.alreadyMerged).toBe(true);
    expect(await models.AuditLog.countDocuments({ action: "case.merge", resourceId: source._id })).toBe(1);
    expect((await request(`/cases/${record._id}`)).body.case.mergedCases[0]._id).toBe(String(source._id));
    expect((await request(`/cases/${source._id}`)).body.case.comments).toHaveLength(0);
    expect((await request(`/cases/${source._id}/reopen`, requester, "POST", {})).status).toBe(409);
    expect((await request(`/cases/${source._id}`, admin, "PATCH", { priority: "high" })).status).toBe(409);
  });
  it("rejects cross-tenant, requester and agent merge operations", async () => {
    const source = await duplicate();
    const body = { targetId: String(record._id), reason: "duplicate_submission" };
    expect((await request(`/cases/${source._id}/merge`, outsider, "POST", body)).status).toBe(404);
    expect((await request(`/cases/${source._id}/merge`, requester, "POST", body)).status).toBe(403);
    expect((await request(`/cases/${source._id}/merge`, agent, "POST", body)).status).toBe(403);
  });
  it("rejects different requesters, services, closed targets and cycles", async () => {
    const source = await duplicate({ requesterId: admin._id });
    const path = `/cases/${source._id}/merge`;
    const body = { targetId: String(record._id), reason: "duplicate_submission" };
    expect((await request(path, admin, "POST", body)).status).toBe(422);
    source.requesterId = requester._id; source.serviceKey = "general_support"; await source.save();
    expect((await request(path, admin, "POST", body)).status).toBe(422);
    source.serviceKey = "it_access"; await source.save();
    expect((await request(path, admin, "POST", { ...body, targetId: String(source._id) })).status).toBe(422);
    expect((await request(`/cases/${record._id}/merge`, admin, "POST", { ...body, targetId: String(source._id) })).status).toBe(422);
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "closed" } });
    expect((await request(path, admin, "POST", body)).status).toBe(422);
  });
  it("allows only one winner when duplicate merge requests race", async () => {
    const target = await duplicate(), source = await duplicate();
    const results = await Promise.all([record, target].map(candidate => request(`/cases/${source._id}/merge`, admin, "POST", { targetId: String(candidate._id), reason: "duplicate_submission" })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    expect(await models.AuditLog.countDocuments({ action: "case.merge", resourceId: source._id })).toBe(1);
  });
});

describe("account security and attachment deletion", () => {
  const signIn = async (user: any = requester) => request("/auth/login", user, "POST", { organizationSlug: org.slug, email: user.email, password: "TestPassword123!" });
  it("signs out one session without revoking another device, then revokes all devices explicitly", async () => {
    const first = await signIn(), second = await signIn();
    expect(first.status).toBe(200);
    expect((await request("/auth/logout", first.body.token, "POST")).status).toBe(200);
    expect((await request("/auth/me", first.body.token)).status).toBe(401);
    expect((await request("/auth/me", second.body.token)).status).toBe(200);
    expect((await models.User.findById(requester._id)).tokenVersion).toBe(0);
    expect((await request("/auth/logout-all", second.body.token, "POST")).status).toBe(200);
    expect((await request("/auth/me", second.body.token)).status).toBe(401);
    expect(await models.RefreshSession.countDocuments({ userId: requester._id, revokedAt: null })).toBe(0);
    expect(await models.AuditLog.countDocuments({ actorId: requester._id, action: "auth.logout_all" })).toBe(1);
  });
  it("restricts newly provisioned users until they change their temporary password", async () => {
    const created = await request("/users", admin, "POST", { name: "New owner", email: "new-owner@test.local", password: "TemporaryPassword123!", role: "requester" });
    expect(created.status).toBe(201);
    const login = await request("/auth/login", requester, "POST", { organizationSlug: org.slug, email: "new-owner@test.local", password: "TemporaryPassword123!" });
    expect(login.body.user).toMatchObject({ mustChangePassword: true, securityRequired: true });
    expect((await request("/cases", login.body.token)).status).toBe(403);
    expect((await request("/profile", login.body.token)).status).toBe(200);
  });
  it("persists an identity-wide attempt budget independently of client IP", async () => {
    const { consumeAuthAttempt } = await import("../src/services/authThrottle.js");
    await consumeAuthAttempt("school:account", "test", 2);
    await consumeAuthAttempt("school:account", "test", 2);
    await expect(consumeAuthAttempt("school:account", "test", 2)).rejects.toMatchObject({ status: 429 });
    await expect(consumeAuthAttempt("school:different-account", "test", 2)).resolves.toBeTypeOf("string");
  });
  it("deletes an owner's mistaken upload permanently and updates quota once", async () => {
    const upload = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: {
      Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "personal.pdf"
    }, body: Buffer.from("%PDF-1.7\nprivate attachment") });
    const { attachment } = await upload.json() as any;
    expect(upload.status).toBe(201);
    const storedFile = await models.Attachment.findById(attachment._id);
    const physicalPath = storedFile.storagePath;
    const path = `/attachments/${attachment._id}`;
    expect((await request(path, outsider, "DELETE", { reason: "personal_data" })).status).toBe(404);
    expect((await request(path, agent, "DELETE", { reason: "personal_data" })).status).toBe(404);
    expect((await request(path, requester, "DELETE", { reason: "personal_data" })).status).toBe(200);
    expect((await request(path, requester, "DELETE", { reason: "personal_data" })).status).toBe(200);
    expect((await request(`${path}/download`)).status).toBe(404);
    expect((await request(`/cases/${record._id}/attachments`)).body.attachments).toHaveLength(0);
    const current = await models.CaseRecord.findById(record._id);
    expect(current.attachmentCount).toBe(0);
    expect(current.attachmentBytes).toBe(0);
    await expect(access(physicalPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await models.AuditLog.countDocuments({ action: "attachment.delete", resourceId: attachment._id })).toBe(1);
  });
  it("encrypts MFA secrets, enforces step-up per session and consumes recovery codes once", async () => {
    const login = await signIn(admin);
    const setup = await request("/profile/mfa/setup", login.body.token, "POST", { password: "TestPassword123!" });
    expect(setup.status).toBe(200);
    const generator = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(setup.body.secret), digits: 6, period: 30, algorithm: "SHA1" });
    const initialCode = generator.generate();
    const enabled = await request("/profile/mfa/enable", login.body.token, "POST", { code: initialCode });
    expect(enabled.status).toBe(200);
    const stored = await models.User.findById(admin._id).select("+mfaSecret +mfaRecoveryHashes");
    expect(stored.mfaSecret).not.toContain(setup.body.secret);
    expect(stored.mfaRecoveryHashes).not.toContain(enabled.body.recoveryCodes[0]);
    expect((await request("/users", login.body.token)).status).toBe(200);
    const next = await signIn(admin);
    expect(next.body.user.securityRequired).toBe(true);
    expect((await request("/users", next.body.token)).status).toBe(403);
    expect((await request("/profile/mfa/verify", next.body.token, "POST", { code: enabled.body.recoveryCodes[0] })).status).toBe(200);
    expect((await request("/users", next.body.token)).status).toBe(200);
    expect((await request("/profile/mfa/verify", next.body.token, "POST", { code: enabled.body.recoveryCodes[0] })).status).toBe(422);
    expect((await request("/profile/mfa/verify", next.body.token, "POST", { code: initialCode })).status).toBe(422);
    expect(await models.AuditLog.countDocuments({ actorId: admin._id, action: "auth.mfa_enable" })).toBe(1);
    expect(await models.AuditLog.countDocuments({ actorId: admin._id, action: "auth.mfa_verify" })).toBe(1);
  });
});

describe("tenant and privacy boundaries", () => {
  it("reuses recommendations and preserves expired feedback metrics", async () => {
    const first = await request("/recommendations", agent, "POST", { caseId: String(record._id) });
    const second = await request("/recommendations", agent, "POST", { caseId: String(record._id) });
    expect(second.body.recommendation._id).toBe(first.body.recommendation._id);
    const id = first.body.recommendation._id;
    const item = first.body.recommendation.items[0]._id;
    expect((await request(`/recommendations/${id}/items/${item}`, agent, "PATCH", { decision: "dismissed", reason: "already_done" })).status).toBe(200);
    await mongoose.model("Recommendation").updateOne({ _id: id }, { expiresAt: new Date(0) });
    const metrics = await request("/recommendations/metrics", admin);
    expect(metrics.body.dismissed).toBe(1);
    expect((await mongoose.model("Recommendation").collection.indexes()).some(index => index.key.expiresAt && index.expireAfterSeconds !== undefined)).toBe(false);
    const durable = await mongoose.model("RecommendationFeedback").findOne({ recommendationId: id }).lean();
    expect(durable).toMatchObject({ decision: "dismissed", decisionReason: "already_done" });
    expect(durable).not.toHaveProperty("content");
    expect(await models.AuditLog.countDocuments({ action: "recommendation.dismissed", resourceId: id })).toBe(1);
    await mongoose.model("Recommendation").deleteOne({ _id: id });
    expect((await request("/recommendations/metrics", admin)).body.dismissed).toBe(1);
    expect((await request("/recommendations/feedback-history", admin)).body.total).toBe(1);
    expect((await request("/recommendations/feedback-history", requester)).status).toBe(403);
    expect((await request("/recommendations/feedback-history", outsider)).body.total).toBe(0);
  });
  it("restricts the agent directory and normalizes requester priority", async () => {
    const users = await request("/users", agent);
    expect(users.body.users.every((user: { role: string; team: string }) => user.role === "agent" && user.team === agent.team)).toBe(true);
    const result = await request("/cases", requester, "POST", { description: "Please help me with my service request", serviceKey: "general_support", priority: "urgent" });
    expect(result.status).toBe(201);
    expect(result.body.case.priority).toBe("normal");
  });
  it("resumes waiting cases after requester replies and blocks closed comments", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { status: "waiting", assigneeId: agent._id, slaPausedAt: new Date(Date.now() - 3600000) });
    const result = await request(`/cases/${record._id}/comments`, requester, "POST", { body: "Here is the requested information" });
    expect(result.status).toBe(201);
    expect(result.body.case.status).toBe("in_progress");
    expect(result.body.case.slaPausedAt).toBeNull();
    await models.CaseRecord.updateOne({ _id: record._id }, { status: "closed", closedAt: new Date(0) });
    expect((await request(`/cases/${record._id}/comments`, requester, "POST", { body: "Another reply" })).status).toBe(422);
    expect((await request(`/cases/${record._id}/reopen`, requester, "POST")).status).toBe(422);
  });
  it("requires a public resolution and protects another assignee's work", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { status: "in_progress", assigneeId: admin._id, "ai.reviewStatus": "confirmed" });
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { status: "resolved", resolutionNote: "Confirmed the account can be accessed." })).status).toBe(403);
    expect((await request(`/cases/${record._id}`, admin, "PATCH", { status: "resolved" })).status).toBe(422);
    const resolved = await request(`/cases/${record._id}`, admin, "PATCH", { status: "resolved", resolutionNote: "Confirmed the account can be accessed." });
    expect(resolved.status).toBe(200);
    expect(resolved.body.case.comments.at(-1)).toMatchObject({ internal: false, body: "Confirmed the account can be accessed." });
  });
  it("limits overview recommendations to managers and their organization", async () => {
    expect((await request("/recommendations/overview", requester, "POST", {})).status).toBe(403);
    expect((await request("/recommendations/overview", agent, "POST", {})).status).toBe(403);
    const result = await request("/recommendations/overview", admin, "POST", {});
    expect(result.status).toBe(200);
    expect(result.body.recommendation.items[0].caseId).toBe(String(record._id));
    expect(result.body.recommendation.generationMode).toBe("operational_rules");
    const other = await request("/recommendations/overview", outsider, "POST", {});
    expect(other.status).toBe(200);
    expect(other.body.recommendation.items.some((item: { caseId?: string }) => item.caseId === String(record._id))).toBe(false);
  });
  it("scopes recommendations and records feedback without changing a case", async () => {
    expect((await request("/recommendations", outsider, "POST", { caseId: String(record._id) })).status).toBe(404);
    const result = await request("/recommendations", agent, "POST", { caseId: String(record._id) });
    expect(result.status).toBe(200);
    const recommendation = result.body.recommendation;
    expect(recommendation.items[0].action).toBe("request_information");
    const path = `/recommendations/${recommendation._id}/items/${recommendation.items[0]._id}`;
    expect((await request(path, requester, "PATCH", { decision: "accepted" })).status).toBe(404);
    expect((await request(path, outsider, "PATCH", { decision: "accepted" })).status).toBe(404);
    expect((await request(path, agent, "PATCH", { decision: "accepted" })).status).toBe(200);
    expect((await request(path, agent, "PATCH", { decision: "accepted" })).status).toBe(200);
    expect(await mongoose.model("RecommendationFeedback").countDocuments({ recommendationId: recommendation._id })).toBe(1);
    await mongoose.model("RecommendationFeedback").deleteMany({ recommendationId: recommendation._id });
    expect((await request(path, agent, "PATCH", { decision: "accepted" })).status).toBe(200);
    expect(await mongoose.model("RecommendationFeedback").countDocuments({ recommendationId: recommendation._id })).toBe(1);
    expect((await request(path, agent, "PATCH", { decision: "dismissed" })).status).toBe(409);
    expect((await request("/recommendations/metrics", requester)).status).toBe(403);
    const metrics = await request("/recommendations/metrics", admin);
    expect(metrics.body.accepted).toBe(1);
    expect(metrics.body.reviewed).toBe(1);
    expect(metrics.body.acceptanceRate).toBe(1);
    expect((await request("/recommendations/metrics", outsider)).body.total).toBe(0);
    expect((await models.CaseRecord.findById(record._id)).status).toBe("new");
  });
  it("rejects recommendations for another team and hides unpublished sources", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { team: "Finance" });
    expect((await request("/recommendations", agent, "POST", { caseId: String(record._id) })).status).toBe(404);
    await models.KnowledgeArticle.create({ organizationId: org._id, title: "Private test request", content: "Private account procedure", category: "it_access", sourceLabel: "Internal", status: "draft" });
    const result = await request("/recommendations", requester, "POST", { text: "I need help with my account", serviceKey: "it_access" });
    expect(result.status).toBe(200);
    expect(result.body.recommendation.citations).toEqual([]);
    expect(result.body.recommendation.items.some((item: { action: string }) => item.action === "draft_reply")).toBe(false);
  });
  it("clamps case pagination and separates predicted risk from overdue cases", async () => {
    const paged = await request("/cases?page=999&limit=8", admin);
    expect(paged.body.page).toBe(1);
    expect(paged.body.cases).toHaveLength(1);
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { "ai.riskScore": 0.8 } });
    expect((await request("/cases?queue=at_risk", admin)).body.total).toBe(1);
    expect((await request("/cases?queue=overdue", admin)).body.total).toBe(0);
    expect((await request("/cases?queue=at_risk", requester)).status).toBe(403);
  });
  it("deduplicates simultaneous case submissions and rejects key reuse with changed content", async () => {
    await models.CaseRecord.init();
    const body = { description: "I need assistance with my account", serviceKey: "general_support" };
    const send = (user = requester, payload = body) => fetch(`${base}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(user)}`, "Idempotency-Key": "test-idempotency-key-123" },
      body: JSON.stringify(payload)
    });
    const results = await Promise.all([send(), send()]);
    expect(results.map(result => result.status).sort()).toEqual([200, 201]);
    const values = await Promise.all(results.map(result => result.json()));
    expect(values[0].case._id).toBe(values[1].case._id);
    expect(values[0].case.idempotencyKeyHash).toBeUndefined();
    expect(values[0].case.requestFingerprint).toBeUndefined();
    expect(await models.CaseRecord.countDocuments({ idempotencyKeyHash: { $exists: true } })).toBe(1);
    expect((await send(requester, { ...body, description: "A different request using the same key" })).status).toBe(409);
    expect((await send(admin)).status).toBe(201);
  });
  it("rejects operator-shaped input and unknown fields", async () => {
    const result = await request("/cases", requester, "POST", { description: "I need assistance with my account", unexpected: "field" });
    expect(result.status).toBe(400);
    expect((await request("/cases", requester, "POST", { description: { $ne: null } })).status).toBe(400);
  });
  it("exchanges a Google login ticket once and rejects replay", async () => {
    const rawTicket = randomBytes(32).toString("hex");
    await models.OAuthLoginTicket.create({
      organizationId: org._id,
      userId: requester._id,
      tokenHash: createHash("sha256").update(rawTicket).digest("hex"),
      remember: false,
      expiresAt: new Date(Date.now() + 60_000)
    });
    const exchange = async () => fetch(`${base}/api/auth/google/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: rawTicket })
    });

    const first = await exchange();
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ remember: false, user: { email: requester.email } });
    expect((await exchange()).status).toBe(401);
  });
  it("restricts agents to cases and attachments in their assigned team", async () => {
    const financeCase = await models.CaseRecord.create({
      organizationId: org._id,
      code: "TEST-FIN-01",
      title: "Finance request",
      description: "A finance request",
      serviceKey: "general_support",
      category: "finance",
      requesterId: requester._id,
      requesterName: requester.name,
      team: "Finance",
      dueAt: new Date(Date.now() + 3_600_000)
    });

    expect((await request(`/cases/${financeCase._id}`, agent)).status).toBe(404);
    expect((await request(`/cases/${financeCase._id}`, agent, "PATCH", { confirmAi: true })).status).toBe(404);
    expect((await request(`/cases/${financeCase._id}/attachments`, agent)).status).toBe(404);
    expect((await request("/cases", agent)).body.total).toBe(1);
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { serviceKey: "general_support" })).status).toBe(200);
    await models.ServiceDefinition.create({ organizationId: org._id, key: "finance_help", name: "Finance", category: "finance", team: "Finance", slaHours: 24 });
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { serviceKey: "finance_help" })).status).toBe(403);
  });
  it("restricts assignment suggestions to staff in the same tenant", async () => {
    expect((await request(`/cases/${record._id}/assignment-options`)).status).toBe(403);
    expect((await request(`/cases/${record._id}/assignment-options`, outsider)).status).toBe(404);
    const response = await request(`/cases/${record._id}/assignment-options`, admin);
    expect(response.status).toBe(200);
    expect(response.body.options).toHaveLength(1);
    expect(response.body.options[0]).toMatchObject({ id: String(agent._id), open: 0, capacity: 15 });
    expect(JSON.stringify(response.body)).not.toContain("password");
  });
  it("counts open work and identifies agents at capacity", async () => {
    await models.User.updateOne({ _id: agent._id }, { maxCaseload: 1 });
    await models.CaseRecord.updateOne({ _id: record._id }, { assigneeId: agent._id, dueAt: new Date(Date.now() - 1000) });
    const response = await request(`/cases/${record._id}/assignment-options`, admin);
    expect(response.body.options[0]).toMatchObject({ open: 1, overdue: 1, atCapacity: true });
  });
  it("filters operational queues and rejects requester access", async () => {
    expect((await request("/cases?queue=unassigned", admin)).body.total).toBe(1);
    expect((await request("/cases?queue=assigned", agent)).body.total).toBe(0);
    expect((await request("/cases?queue=overdue", admin)).body.total).toBe(0);
    expect((await request("/cases?queue=due_soon", admin)).body.total).toBe(1);
    expect((await request("/cases?queue=unassigned")).status).toBe(403);
    expect((await request("/cases?queue=unassigned", outsider)).body.total).toBe(0);
    await models.CaseRecord.updateOne({ _id: record._id }, { status: "resolved" });
    expect((await request("/cases?queue=unassigned", admin)).body.total).toBe(0);
  });
  it("never returns another tenant's case", async () => {
    expect((await request(`/cases/${record._id}`, outsider)).status).toBe(404);
    expect((await request("/cases", outsider)).body.total).toBe(0);
  });
  it("hides internal notes in detail, list, dashboard and comment responses", async () => {
    await request(`/cases/${record._id}/comments`, agent, "POST", { body: "CONFIDENTIAL_INTERNAL_NOTE", internal: true });
    for (const path of [`/cases/${record._id}`, "/cases", "/dashboard"]) {
      const result = await request(path);
      expect(result.status).toBe(200);
      expect(JSON.stringify(result.body)).not.toContain("CONFIDENTIAL_INTERNAL_NOTE");
      expect(JSON.stringify(result.body)).not.toContain("Đã thêm ghi chú nội bộ");
    }
    const reply = await request(`/cases/${record._id}/comments`, requester, "POST", { body: "Public response" });
    expect(JSON.stringify(reply.body)).not.toContain("CONFIDENTIAL_INTERNAL_NOTE");
    expect((await request(`/cases/${record._id}`, agent)).body.case.comments[0].body).toBe("CONFIDENTIAL_INTERNAL_NOTE");
  });
  it("does not leak other requesters via similar cases", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { requesterId: agent._id, title: "PRIVATE_TITLE" });
    const result = await request("/ai/analyze-intake", requester, "POST", { text: "Cannot access student account" });
    expect(result.status).toBe(200);
    expect(result.body.similar).toEqual([]);
  });
  it("rejects requester internal notes and admin operations", async () => {
    expect((await request(`/cases/${record._id}/comments`, requester, "POST", { body: "note", internal: true })).status).toBe(403);
    expect((await request(`/users/${agent._id}`, requester, "PATCH", { active: false })).status).toBe(403);
  });
});

describe("session revocation", () => {
  it("keeps the session valid after an incorrect current password", async () => {
    const old = token(requester);
    expect((await request("/profile/change-password", old, "POST", { currentPassword: "WrongPassword123!", newPassword: "Replacement123!" })).status).toBe(422);
    expect((await request("/auth/me", old)).status).toBe(200);
  });
  it("revokes sessions after self-service password changes", async () => {
    const old = token(requester);
    expect((await request("/profile/change-password", old, "POST", { currentPassword: "TestPassword123!", newPassword: "Replacement123!" })).status).toBe(200);
    expect((await request("/auth/me", old)).status).toBe(401);
  });
  it("rejects passwords exceeding bcrypt byte limits", async () => {
    expect((await request("/profile/change-password", requester, "POST", { currentPassword: "TestPassword123!", newPassword: "ấ".repeat(30) })).status).toBe(400);
    expect((await request(`/users/${requester._id}/password`, admin, "PATCH", { password: "ấ".repeat(30) })).status).toBe(400);
    expect((await request("/users", admin, "POST", {
      name: "Long password", email: "long-password@test.local", password: "ấ".repeat(30), role: "requester"
    })).status).toBe(400);
  });
  it("checks disabled accounts and suspended organizations on every request", async () => {
    const old = token(requester);
    await models.User.updateOne({ _id: requester._id }, { active: false });
    expect((await request("/cases", old)).status).toBe(401);
    await models.User.updateOne({ _id: requester._id }, { active: true });
    await models.Organization.updateOne({ _id: org._id }, { status: "suspended" });
    expect((await request("/cases", old)).status).toBe(401);
  });
  it("invalidates old tokens after password reset", async () => {
    const old = token(requester);
    expect((await request(`/users/${requester._id}/password`, admin, "PATCH", { password: "NewPassword123!" })).status).toBe(200);
    expect((await request("/cases", old)).status).toBe(401);
    const login = await request("/auth/login", old, "POST", { organizationSlug: org.slug, email: requester.email, password: "NewPassword123!" });
    expect(login.status).toBe(200);
    expect((await request("/cases", login.body.token)).status).toBe(403);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect((await request("/profile/change-password", login.body.token, "POST", { currentPassword: "NewPassword123!", newPassword: "OwnerPassword123!" })).status).toBe(200);
  });
  it("does not disclose accounts through password reset requests", async () => {
    const known = await request("/auth/password-reset/request", requester, "POST", { organizationSlug: org.slug, email: requester.email });
    const unknown = await request("/auth/password-reset/request", requester, "POST", { organizationSlug: org.slug, email: "nobody@test.local" });
    const { EmailOutbox, processEmailOutbox } = await import("../src/services/emailOutbox.js");
    const queued = await EmailOutbox.find().lean();
    expect(queued.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(queued)).not.toContain(requester.email);
    await processEmailOutbox();
    expect(await models.PasswordResetToken.countDocuments({ userId: requester._id })).toBe(1);
    expect(known.status).toBe(202);
    expect(unknown).toEqual(known);
  });
  it("uses password reset links once and revokes existing sessions", async () => {
    const rawToken = "a".repeat(64);
    await models.PasswordResetToken.create({ organizationId: org._id, userId: requester._id, tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt: new Date(Date.now() + 60_000) });
    const old = token(requester);
    const reset = await request("/auth/password-reset/confirm", requester, "POST", { organizationSlug: org.slug, token: rawToken, password: "ResetPassword123!" });
    expect(reset.status).toBe(200);
    expect((await request("/auth/me", old)).status).toBe(401);
    expect((await request("/auth/password-reset/confirm", requester, "POST", { organizationSlug: org.slug, token: rawToken, password: "AnotherPassword123!" })).status).toBe(422);
    expect((await request("/auth/login", old, "POST", { organizationSlug: org.slug, email: requester.email, password: "ResetPassword123!" })).status).toBe(200);
  });
  it("protects administrator accounts from deactivation", async () => {
    expect((await request(`/users/${admin._id}`, admin, "PATCH", { active: false })).status).toBe(403);
  });
});

describe("case workflow and validation", () => {
  it("counts MongoDB ObjectIds correctly and validates pagination", async () => {
    expect((await request("/cases/counts")).body.counts).toMatchObject({ all: 1, new: 1 });
    expect((await request("/cases?page=Infinity&limit=2.5")).body).toMatchObject({ page: 1, limit: 2, total: 1 });
  });
  it("rejects skipped states and requires an assignee", async () => {
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { status: "resolved" })).status).toBe(422);
    await request(`/cases/${record._id}`, agent, "PATCH", { confirmAi: true });
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { status: "in_progress" })).status).toBe(422);
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { assigneeId: String(agent._id), status: "in_progress" })).status).toBe(200);
  });
  it("preserves resolution time at closure and clears it on reopening", async () => {
    await request(`/cases/${record._id}`, agent, "PATCH", { confirmAi: true, assigneeId: String(agent._id), status: "in_progress" });
    const resolved = await request(`/cases/${record._id}`, agent, "PATCH", { status: "resolved", resolutionNote: "Completed account support and verified access." });
    const closed = await request(`/cases/${record._id}`, agent, "PATCH", { status: "closed" });
    expect(closed.body.case.resolvedAt).toBe(resolved.body.case.resolvedAt);
    expect(closed.body.case.closedAt).toBeTruthy();
    const reopened = await request(`/cases/${record._id}`, agent, "PATCH", { status: "in_progress" });
    expect(reopened.body.case).toMatchObject({ resolvedAt: null, closedAt: null, reopenCount: 1 });
    expect(reopened.body.case.cycles).toHaveLength(1);
    expect(reopened.body.case.cycles[0].resolvedAt).toBe(resolved.body.case.resolvedAt);
    const compliance = await request("/analytics/sla-compliance", admin);
    expect(compliance.body.overall.total).toBe(1);
  });
  it("validates explicit services and their required fields", async () => {
    const body = { description: "Cannot access student account", serviceKey: "missing" };
    expect((await request("/cases", requester, "POST", body)).status).toBe(422);
    expect((await request("/cases", requester, "POST", { ...body, serviceKey: "it_access" })).status).toBe(422);
    const valid = await request("/cases", requester, "POST", { ...body, serviceKey: "it_access", customFields: { "Student ID": "SV001" } });
    expect(valid.status).toBe(201);
    expect(valid.body.case.customFields).toEqual({ "Student ID": "SV001" });
    expect((await request("/cases", requester, "POST", { ...body, serviceKey: "it_access", customFields: { "Student ID": "SV001", unknown: "value" } })).status).toBe(422);
    expect((await request("/cases", requester, "POST", { ...body, serviceKey: "it_access", channel: "phone", customFields: { "Student ID": "SV001" } })).status).toBe(422);
  });
  it("does not disable general intake or enable unsupported auto-assignment", async () => {
    const service = await models.ServiceDefinition.findOne({ key: "general_support" });
    expect((await request(`/services/${service!._id}`, admin, "DELETE")).status).toBe(422);
    expect((await request(`/services/${service!._id}`, admin, "PATCH", { autoAssign: true })).status).toBe(400);
  });
  it("runs the team performance aggregation without unsupported operators", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { assigneeId: agent._id, assigneeName: agent.name });
    const result = await request("/analytics/team-performance", admin);
    expect(result.status).toBe(200);
    expect(result.body.agents[0].open).toBe(1);
  });
});

describe("knowledge governance and AI metrics", () => {
  it("replays committed uploads without duplicate files and rejects changed payloads or deleted files", async () => {
    const { config } = await import("../src/config.js");
    const previous = config.STORAGE_PROVIDER; config.STORAGE_PROVIDER = "cloudinary";
    const upload = (body: string) => fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf", "Idempotency-Key": "upload-idempotency-fixture-01" }, body: Buffer.from(body) });
    try {
      const first = await upload("%PDF-1.4\noriginal fixture");
      const second = await upload("%PDF-1.4\noriginal fixture");
      expect(first.status).toBe(201); expect(second.status).toBe(201);
      const a = await first.json() as any, b = await second.json() as any;
      expect(a.attachment._id).toBe(b.attachment._id);
      expect(b.attachment.uploadFingerprint).toBeUndefined();
      expect(b.attachment.objectKey).toBeUndefined();
      expect(await models.Attachment.countDocuments()).toBe(1);
      expect(cloudObjects.size).toBe(1);
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(1);
      expect((await upload("%PDF-1.4\nchanged fixture")).status).toBe(409);
      expect((await request(`/attachments/${a.attachment._id}`, requester, "DELETE", { reason: "personal_data" })).status).toBe(200);
      expect((await upload("%PDF-1.4\noriginal fixture")).status).toBe(409);
      expect(cloudObjects.size).toBe(0);
    } finally { config.STORAGE_PROVIDER = previous; }
  });
  it("reserves quota once for simultaneous uploads with the same identity and key", async () => {
    const upload = () => fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "parallel.pdf", "Idempotency-Key": "upload-parallel-fixture-01" }, body: Buffer.from("%PDF-1.4\nparallel fixture") });
    const responses = await Promise.all([upload(), upload()]);
    expect(responses.some(response => response.status === 201)).toBe(true);
    expect(responses.map(response => response.status).every(status => [201, 409].includes(status)), responses.map(response => response.status).join(",")).toBe(true);
    expect(await models.Attachment.countDocuments()).toBe(1);
    const saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
    expect(saved.attachmentCount).toBe(1);
    expect(saved.attachmentReservations).toHaveLength(0);
  });
  it("cleans local bytes after an interrupted metadata commit", async () => {
    const { recoverAttachmentUploads } = await import("../src/services/attachmentUploads.js");
    const create = vi.spyOn(models.Attachment, "create").mockRejectedValueOnce(new Error("Local metadata failure"));
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\nlocal recovery fixture") });
      expect(response.status).toBe(500);
      const saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
      const path = join(uploads, saved.attachmentReservations[0].filename);
      await expect(access(path)).resolves.toBeUndefined();
      await recoverAttachmentUploads(new Date(Date.now() + 180000));
      await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(0);
    } finally { create.mockRestore(); }
  });
  it("fails closed on scanner outages before reserving quota or storing bytes", async () => {
    const scanner = await import("../src/services/malwareScanner.js");
    const { HttpError } = await import("../src/middleware/error.js");
    const scan = vi.spyOn(scanner, "scanFile").mockRejectedValueOnce(new HttpError(503, "Scanner unavailable"));
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\nscanner fixture") });
      expect(response.status).toBe(503);
      expect(await models.Attachment.countDocuments()).toBe(0);
      const saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
      expect(saved.attachmentCount).toBe(0);
      expect(saved.attachmentReservations).toHaveLength(0);
      expect(cloudObjects.size).toBe(0);
    } finally { scan.mockRestore(); }
  });
  it("hides files after failed deletion and lets their owner retry without double quota release", async () => {
    const { config } = await import("../src/config.js");
    const previous = config.STORAGE_PROVIDER; config.STORAGE_PROVIDER = "cloudinary";
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\ndelete retry fixture") });
      const { attachment } = await response.json() as { attachment: { _id: string } };
      expect(response.status).toBe(201);
      cloudFaults.deletion = true;
      expect((await request(`/attachments/${attachment._id}`, requester, "DELETE", { reason: "personal_data" })).status).toBe(503);
      expect((await request(`/cases/${record._id}/attachments`, requester)).body.attachments).toHaveLength(0);
      expect((await request(`/attachments/${attachment._id}/download`, requester)).status).toBe(404);
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(1);
      cloudFaults.deletion = false;
      for (let retry = 0; retry < 2; retry++) expect((await request(`/attachments/${attachment._id}`, requester, "DELETE", { reason: "personal_data" })).status).toBe(200);
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(0);
      expect(cloudObjects.size).toBe(0);
    } finally { config.STORAGE_PROVIDER = previous; cloudFaults.deletion = false; }
  });
  it("recovers orphaned uploads after metadata failure and retains failed cleanup for retry", async () => {
    const { config } = await import("../src/config.js");
    const { recoverAttachmentUploads } = await import("../src/services/attachmentUploads.js");
    const previous = config.STORAGE_PROVIDER; config.STORAGE_PROVIDER = "cloudinary";
    const create = vi.spyOn(models.Attachment, "create").mockRejectedValueOnce(new Error("Simulated metadata failure"));
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\nrecovery fixture") });
      expect(response.status).toBe(500);
      expect(cloudObjects.size).toBe(1);
      expect((await request(`/cases/${record._id}`, requester)).body.case.attachmentReservations).toBeUndefined();
      cloudFaults.deletion = true;
      const later = new Date(Date.now() + 180000);
      await recoverAttachmentUploads(later);
      let saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
      expect(saved.attachmentCount).toBe(1);
      expect(saved.attachmentReservations).toHaveLength(1);
      cloudFaults.deletion = false;
      await recoverAttachmentUploads(later);
      await recoverAttachmentUploads(later);
      saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
      expect(saved.attachmentCount).toBe(0);
      expect(saved.attachmentBytes).toBe(0);
      expect(saved.attachmentReservations).toHaveLength(0);
      expect(cloudObjects.size).toBe(0);
    } finally { create.mockRestore(); config.STORAGE_PROVIDER = previous; }
  });
  it("recovers remote writes whose upload acknowledgement was lost", async () => {
    const { config } = await import("../src/config.js");
    const { recoverAttachmentUploads } = await import("../src/services/attachmentUploads.js");
    const previous = config.STORAGE_PROVIDER; config.STORAGE_PROVIDER = "cloudinary";
    cloudFaults.uploadAfterWrite = true;
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\npartial write fixture") });
      expect(response.status).toBe(500);
      expect(await models.Attachment.countDocuments()).toBe(0);
      expect(cloudObjects.size).toBe(1);
      await recoverAttachmentUploads(new Date(Date.now() + 180000));
      expect(cloudObjects.size).toBe(0);
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(0);
    } finally { config.STORAGE_PROVIDER = previous; }
  });
  it("never removes a committed file when recovering a stale upload reservation", async () => {
    const { config } = await import("../src/config.js");
    const { recoverAttachmentUploads } = await import("../src/services/attachmentUploads.js");
    const previous = config.STORAGE_PROVIDER; config.STORAGE_PROVIDER = "cloudinary";
    try {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: Buffer.from("%PDF-1.4\ncommitted fixture") });
      expect(response.status).toBe(201);
      const file = await models.Attachment.findOne({ caseId: record._id });
      await models.CaseRecord.updateOne({ _id: record._id }, { $push: { attachmentReservations: { _id: file._id, filename: file.filename, size: file.size, storageProvider: "cloudinary", expiresAt: new Date(0) } } });
      await recoverAttachmentUploads();
      expect(cloudObjects.size).toBe(1);
      const saved = await models.CaseRecord.findById(record._id).select("+attachmentReservations");
      expect(saved.attachmentCount).toBe(1);
      expect(saved.attachmentReservations).toHaveLength(0);
      const duplicateName = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf";
      cloudObjects.set(`${org._id}/${record._id}/${duplicateName}`, Buffer.from("uncommitted duplicate"));
      await models.CaseRecord.updateOne({ _id: record._id }, { $inc: { attachmentCount: 1, attachmentBytes: file.size }, $push: { attachmentReservations: { _id: file._id, filename: duplicateName, size: file.size, storageProvider: "cloudinary", expiresAt: new Date(0) } } });
      await recoverAttachmentUploads();
      expect(cloudObjects.size).toBe(1);
      expect((await models.CaseRecord.findById(record._id)).attachmentCount).toBe(1);
    } finally { config.STORAGE_PROVIDER = previous; }
  });
  it("keeps Cloudinary files behind tenant and case authorization through upload, download and deletion", async () => {
    const { config } = await import("../src/config.js");
    const previous = config.STORAGE_PROVIDER;
    config.STORAGE_PROVIDER = "cloudinary";
    try {
      const upload = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST",
        headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" },
        body: Buffer.from("%PDF-1.4\nsynthetic fixture") });
      expect(upload.status).toBe(201);
      const { attachment } = await upload.json() as any;
      expect(attachment.storageProvider).toBe("cloudinary");
      expect(attachment.objectKey).toBeUndefined();
      const id = attachment._id;
      expect((await request(`/attachments/${id}/download`, outsider)).status).toBe(404);
      const download = await fetch(`${base}/api/attachments/${id}/download`, { headers: { Authorization: `Bearer ${token(requester)}` } });
      expect(download.status).toBe(200);
      expect(download.headers.get("cache-control")).toBe("private, no-store");
      expect(await download.text()).toBe("%PDF-1.4\nsynthetic fixture");
      expect((await request(`/attachments/${id}`, outsider, "DELETE", { reason: "personal_data" })).status).toBe(404);
      expect((await request(`/attachments/${id}`, requester, "DELETE", { reason: "uploaded_by_mistake" })).status).toBe(200);
      expect(cloudObjects.size).toBe(0);
    } finally { config.STORAGE_PROVIDER = previous; cloudObjects.clear(); }
  });
  it("accepts staff proxy intake without transferring ownership to the operator", async () => {
    const body = { description: "Student cannot access the student portal", serviceKey: "it_access", channel: "phone",
      customFields: { "Student ID": "SV001" }, requesterId: String(requester._id) };
    const created = await request("/cases", agent, "POST", body);
    expect(created.status).toBe(201);
    expect(created.body.case.requesterId).toBe(String(requester._id));
    expect(created.body.case.createdById).toBe(String(agent._id));
    expect((await request(`/cases/${created.body.case._id}`, requester)).status).toBe(200);
    expect((await request("/cases", requester, "POST", { ...body, channel: "portal", requesterId: String(admin._id) })).status).toBe(403);
    expect((await request("/cases", agent, "POST", { ...body, requesterId: String(outsider._id) })).status).toBe(422);
    const { processCaseDeliveries } = await import("../src/jobs/caseDelivery.js");
    await processCaseDeliveries();
    const count = await models.Notification.countDocuments({ relatedCaseId: created.body.case._id });
    expect(count).toBeGreaterThan(0);
    await processCaseDeliveries();
    expect(await models.Notification.countDocuments({ relatedCaseId: created.body.case._id })).toBe(count);
    const stored = await models.CaseRecord.findById(created.body.case._id).lean<any>();
    expect(stored.deliveryEvents[0].completedAt).toBeTruthy();
    expect(created.body.case.deliveryEvents).toBeUndefined();
  });

  it("persists validity dates and rejects contradictory partial updates", async () => {
    const created = await request("/knowledge", admin, "POST", {
      title: "Validity controlled guide", content: "Approved procedural guidance for students.",
      category: "it_access", sourceLabel: "School", status: "published",
      effectiveAt: "2020-01-01T00:00:00.000Z", expiresAt: "2090-01-01T00:00:00.000Z"
    });
    expect(created.status).toBe(201);
    expect(created.body.article.expiresAt).toBe("2090-01-01T00:00:00.000Z");
    const path = `/knowledge/${created.body.article._id}`;
    expect((await request(path, admin, "PATCH", { expiresAt: "2019-01-01T00:00:00.000Z" })).status).toBe(422);
    expect((await request(path, admin, "PATCH", { effectiveAt: "2091-01-01T00:00:00.000Z" })).status).toBe(422);
    expect((await request(path, outsider, "PATCH", { expiresAt: null })).status).toBe(404);
    expect((await request(path, admin, "PATCH", { expiresAt: null, status: "published" })).body.article.expiresAt).toBeNull();
  });

  it("shares a step-up attempt budget across password change and account linking", async () => {
    const { consumeAuthAttempt } = await import("../src/services/authThrottle.js");
    for (let i = 0; i < 20; i++) await consumeAuthAttempt(`${org._id}:${requester._id}`, "password-step-up");
    expect((await request("/profile/change-password", requester, "POST", {
      currentPassword: "TestPassword123!", newPassword: "Replacement123!"
    })).status).toBe(429);
    expect((await request("/auth/microsoft/link", requester, "POST", { currentPassword: "TestPassword123!" })).status).toBe(429);
  });
  it("requires review before documents reach users and retrieval", async () => {
    const draft = await request("/knowledge", agent, "POST", { title: "Account policy", content: "This is a test policy with enough content.", category: "it_access", sourceLabel: "Test handbook" });
    expect(draft.status).toBe(201);
    expect((await request("/knowledge")).body.articles).toHaveLength(0);
    expect((await request("/knowledge/search", requester, "POST", { query: "account policy" })).body.citations).toHaveLength(0);
    expect((await request(`/knowledge/${draft.body.article._id}`, agent, "PATCH", { status: "published" })).status).toBe(403);
    const published = await request(`/knowledge/${draft.body.article._id}`, admin, "PATCH", { status: "published" });
    expect(published.status).toBe(200);
    expect((await request("/knowledge")).body.articles).toHaveLength(1);
    expect((await request(`/knowledge/${draft.body.article._id}`, agent, "PATCH", { content: "An agent must not edit published content." })).status).toBe(403);

    expect((await request(`/knowledge/${draft.body.article._id}`, admin, "PATCH", { title: "Revised account policy" })).status).toBe(409);
    const updated = await request(`/knowledge/${draft.body.article._id}`, admin, "PATCH", { title: "Revised account policy", status: "published" });
    expect(updated.status).toBe(200);
    expect(updated.body.article).toMatchObject({
      status: "published",
      reviewedByName: published.body.article.reviewedByName
    });
    expect(updated.body.article.version).not.toBe(published.body.article.version);
    const archived = await request(`/knowledge/${draft.body.article._id}/versions/${published.body.article.version}`);
    expect(archived.status).toBe(200);
    expect(archived.body.article.title).toBe(published.body.article.title);
    expect((await request("/knowledge")).body.articles).toHaveLength(1);
  });
  it("only lets agents see their own unpublished knowledge drafts", async () => {
    const otherAgent = await models.User.create({
      organizationId: org._id, name: "Other Agent", email: "other-agent@test.local",
      passwordHash: await bcrypt.hash("TestPassword123!", 4), role: "agent", team: "IT"
    });
    const draft = await request("/knowledge", agent, "POST", {
      title: "Private draft", content: "This document is a private draft long enough for validation.", category: "it_access", sourceLabel: "Draft"
    });
    expect(draft.status).toBe(201);
    expect((await request("/knowledge", otherAgent)).body.articles).toHaveLength(0);
    expect((await request("/knowledge", agent)).body.articles).toHaveLength(1);
  });
  it("does not claim 100% accuracy for unreviewed AI predictions", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { "ai.classification": "it_access" });
    const result = await request("/analytics/ai-accuracy", admin);
    expect(result.body).toMatchObject({ total: 1, pending: 1, reviewed: 0, confirmationRate: null });
    expect(result.body).not.toHaveProperty("accuracy");
  });
});

describe("attachments", () => {
  it("keeps staff uploads private by default and blocks requester downloads", async () => {
    const upload = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: {
      Authorization: `Bearer ${token(agent)}`, "Content-Type": "application/octet-stream", "X-Filename": "internal.pdf"
    }, body: new Uint8Array(Buffer.from("%PDF-1.4 internal fixture")) });
    expect(upload.status).toBe(201);
    const value = await upload.json();
    expect(value.attachment.internal).toBe(true);
    expect((await request(`/cases/${record._id}/attachments`, requester)).body.attachments).toHaveLength(0);
    expect((await request(`/attachments/${value.attachment._id}/download`, requester)).status).toBe(404);
  });
  it("enforces per-case quotas and rejects uploads to closed cases", async () => {
    await models.Attachment.create(Array.from({ length: 10 }, (_, index) => ({ organizationId: org._id, caseId: record._id,
      uploaderId: requester._id, uploaderName: requester.name, filename: `fixture-${index}.pdf`, originalName: "fixture.pdf", mimeType: "application/pdf", size: 10 })));
    const send = () => fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: {
      Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf"
    }, body: new Uint8Array(Buffer.from("%PDF-1.4 quota fixture")) });
    expect((await send()).status).toBe(422);
    await models.CaseRecord.updateOne({ _id: record._id }, { status: "closed" });
    expect((await send()).status).toBe(422);
  });
  it("validates file signatures, hides server paths and protects downloads", async () => {
    const upload = async (buffer: Buffer) => {
      const response = await fetch(`${base}/api/cases/${record._id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" }, body: new Uint8Array(buffer) });
      return { status: response.status, body: await response.json() as any };
    };
    expect((await upload(Buffer.from("not a PDF"))).status).toBe(400);
    const content = Buffer.from("%PDF-1.4\nround trip\n%%EOF");
    const result = await upload(content);
    expect(result.status).toBe(201);
    expect(result.body.attachment).not.toHaveProperty("storagePath");
    const listing = await request(`/cases/${record._id}/attachments`);
    expect(listing.body.attachments[0]).not.toHaveProperty("storagePath");
    const fileId = result.body.attachment._id;
    const uploaded = await models.AuditLog.findOne({ action: "attachment.upload", resourceId: fileId }).lean();
    expect(uploaded?.changes).toMatchObject({ filename: "test.pdf" });
    expect((await request(`/attachments/${fileId}/download`, outsider)).status).toBe(404);
    const download = await fetch(`${base}/api/attachments/${fileId}/download`, { headers: { Authorization: `Bearer ${token(requester)}` } });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(content);
    const audit = await models.AuditLog.findOne({ action: "attachment.download", resourceId: fileId }).lean();
    expect(audit?.changes).toMatchObject({ filename: "test.pdf" });
  });
  it("enforces each organization's upload policy", async () => {
    await models.Organization.updateOne({ _id: org._id }, { $set: { "settings.maxFileSizeMB": 1, "settings.allowedFileTypes": [".png"] } });
    const response = await fetch(`${base}/api/cases/${record._id}/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token(requester)}`, "Content-Type": "application/octet-stream", "X-Filename": "test.pdf" },
      body: new Uint8Array(Buffer.from("%PDF-1.4\nblocked\n%%EOF"))
    });
    expect(response.status).toBe(400);
  });
});

describe("security audit and distributed jobs", () => {
  async function loginSession() {
    return fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationSlug: org.slug, email: requester.email, password: "TestPassword123!", remember: false }) });
  }
  const cookie = (response: Response) => response.headers.get("set-cookie")!.split(";")[0];
  const refresh = (value: string, origin?: string) => fetch(`${base}/api/auth/refresh`, {
    method: "POST", headers: { Cookie: value, ...(origin ? { Origin: origin } : {}) }
  });
  it("rotates hashed refresh tokens and rejects replay including the replacement", async () => {
    const login = await loginSession();
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(login.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(login.headers.get("set-cookie")).not.toContain("Max-Age");
    const access = (await login.json() as any).token;
    const claims = jwt.decode(access) as jwt.JwtPayload;
    expect(claims.exp! - claims.iat!).toBe(900);
    const original = cookie(login);
    const renewed = await refresh(original);
    expect(renewed.status).toBe(200);
    expect(cookie(renewed)).not.toBe(original);
    const stored = await models.RefreshSession.findOne({ consumedAt: null }).lean<any>();
    expect(stored.tokenHash).not.toBe(cookie(renewed).split("=")[1]);
    expect((await refresh(original)).status).toBe(401);
    expect((await refresh(cookie(renewed))).status).toBe(401);
  });
  it("blocks cross-site refresh without consuming the legitimate token", async () => {
    const login = await loginSession();
    expect((await refresh(cookie(login), "https://attacker.invalid")).status).toBe(403);
    expect((await refresh(cookie(login))).status).toBe(200);
  });
  it("does not authorize logout using a consumed cookie", async () => {
    const login = await loginSession();
    const renewed = await refresh(cookie(login));
    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: {
      Cookie: cookie(login), Authorization: "Bearer invalid-access-token"
    } });
    expect(logout.status).toBe(401);
    expect((await refresh(cookie(renewed))).status).toBe(200);
  });
  it("revokes refresh tokens on logout and rejects inactive accounts", async () => {
    const login = await loginSession();
    const access = (await login.json() as any).token;
    expect((await request("/auth/logout", access, "POST")).status).toBe(200);
    expect((await refresh(cookie(login))).status).toBe(401);
    const next = await loginSession();
    await models.User.updateOne({ _id: requester._id }, { $set: { active: false } });
    expect((await refresh(cookie(next))).status).toBe(401);
  });
  it("records successful login and logout without routine case reads", async () => {
    const login = await request("/auth/login", requester, "POST", { organizationSlug: org.slug, email: requester.email, password: "TestPassword123!" });
    expect(login.status).toBe(200);
    expect((await request(`/cases/${record._id}`, login.body.token)).status).toBe(200);
    expect((await request("/auth/logout", login.body.token, "POST")).status).toBe(200);
    const actions = await models.AuditLog.find({ actorId: requester._id }).select("action").lean();
    expect(actions.map((item: any) => item.action)).toEqual(expect.arrayContaining(["auth.login", "auth.logout"]));
    const history = await request("/analytics/audit-log?action=case.view", admin);
    expect(history.status).toBe(200);
    expect(history.body.logs).toHaveLength(0);
    const loginHistory = await request("/analytics/audit-log?action=auth.login", admin);
    expect(loginHistory.body.logs[0]).not.toHaveProperty("ip");
    expect(loginHistory.body.logs[0]).not.toHaveProperty("userAgent");
  });
  it("lets only one API instance acquire an SLA job lease", async () => {
    const { acquireJobLease, releaseJobLease } = await import("../src/services/jobLease.js");
    const first = await acquireJobLease("test-sla-lease", 60_000);
    expect(first).not.toBeNull();
    expect(await acquireJobLease("test-sla-lease", 60_000)).toBeNull();
    await releaseJobLease("test-sla-lease", first!.ownerId);
    expect(await acquireJobLease("test-sla-lease", 60_000)).not.toBeNull();
  });
  it("keeps Microsoft and Google login tickets isolated and single-use", async () => {
    const rawTicket = randomBytes(32).toString("hex");
    await models.OAuthLoginTicket.create({ organizationId: org._id, userId: requester._id, provider: "microsoft", tokenHash: createHash("sha256").update(rawTicket).digest("hex"), remember: false, expiresAt: new Date(Date.now() + 60000) });
    expect((await request("/auth/google/exchange", requester, "POST", { ticket: rawTicket })).status).toBe(401);
    const result = await request("/auth/microsoft/exchange", requester, "POST", { ticket: rawTicket });
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe(requester.email);
    expect((await request("/auth/microsoft/exchange", requester, "POST", { ticket: rawTicket })).status).toBe(401);
  });
  it("rejects a Microsoft callback without matching state before calling the provider", async () => {
    const response = await fetch(`${base}/api/auth/microsoft/callback?state=bad&code=1234567890`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("oauthError=invalid_request");
    expect(response.headers.get("location")).toContain("oauthProvider=microsoft");
  });
  it("requires password confirmation when linking Microsoft", async () => {
    expect((await request("/auth/microsoft/link", requester, "POST", { currentPassword: "wrong-password" })).status).toBe(401);
  });
  it("links a password-confirmed account, then signs in only by its immutable Microsoft identity", async () => {
    const link = await fetch(`${base}/api/auth/microsoft/link`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(requester)}` }, body: JSON.stringify({ currentPassword: "TestPassword123!" }) });
    expect(link.status).toBe(200);
    const { url } = await link.json() as { url: string };
    const authorize = new URL(url);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("scope")).toBe("openid profile");
    expect(authorize.searchParams.has("code_verifier")).toBe(false);
    const cookie = link.headers.get("set-cookie")!.split(";")[0];
    const originalFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (String(url).startsWith("https://login.microsoftonline.com/")) return new Response(JSON.stringify({ id_token: "mock-id-token" }));
      return originalFetch(url, options);
    });
    try {
      const callback = await fetch(`${base}/api/auth/microsoft/callback?state=${authorize.searchParams.get("state")}&code=1234567890`, { headers: { Cookie: cookie }, redirect: "manual" });
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toContain("microsoftLinked=true");
      const saved = await models.User.findById(requester._id).select("+microsoftObjectId +microsoftTenantId").lean<any>();
      expect(saved.microsoftObjectId).toBe("22222222-2222-4222-8222-222222222222");
      expect((await request("/profile")).body.profile.microsoftLinked).toBe(true);
      const start = await fetch(`${base}/api/auth/microsoft?organization=test-university&remember=false`, { redirect: "manual" });
      const startUrl = new URL(start.headers.get("location")!);
      const signIn = await fetch(`${base}/api/auth/microsoft/callback?state=${startUrl.searchParams.get("state")}&code=1234567890`, { headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] }, redirect: "manual" });
      const ticket = new URL(signIn.headers.get("location")!).searchParams.get("microsoftCode");
      expect(ticket).toMatch(/^[a-f0-9]{64}$/);
      expect((await request("/auth/microsoft/exchange", requester, "POST", { ticket })).status).toBe(200);
    } finally { spy.mockRestore(); }
  });
  it("does not auto-link an unbound Microsoft account by an email claim", async () => {
    const start = await fetch(`${base}/api/auth/microsoft?organization=test-university`, { redirect: "manual" });
    const url = new URL(start.headers.get("location")!);
    const originalFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => String(url).startsWith("https://login.microsoftonline.com/") ? new Response(JSON.stringify({ id_token: "mock-token" })) : originalFetch(url, options));
    try {
      const callback = await fetch(`${base}/api/auth/microsoft/callback?state=${url.searchParams.get("state")}&code=1234567890`, { headers: { Cookie: start.headers.get("set-cookie")!.split(";")[0] }, redirect: "manual" });
      expect(callback.headers.get("location")).toContain("oauthError=not_linked");
      expect(await models.OAuthLoginTicket.countDocuments()).toBe(0);
    } finally { spy.mockRestore(); }
  });
  it("does not revoke a session when only a user's name changes", async () => {
    const oldToken = token(requester);
    expect((await request(`/users/${requester._id}`, admin, "PATCH", { name: "Renamed student" })).status).toBe(200);
    expect((await request("/auth/me", oldToken)).status).toBe(200);
    const saved = await models.User.findById(requester._id).lean<any>();
    expect(saved.tokenVersion).toBe(requester.tokenVersion);
  });
  it("authenticates a protected system request once and rejects anonymous admin access", async () => {
    const spy = vi.spyOn(models.Organization, "exists");
    try {
      expect((await request("/system/status", admin)).status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect((await fetch(`${base}/api/users`)).status).toBe(401);
  });
  it("restarts the SLA clock and clears the breach on requester reopen", async () => {
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "resolved", assigneeId: agent._id, assigneeName: agent.name, resolvedAt: new Date(), dueAt: new Date(0), slaBreached: true, slaBreachedAt: new Date(0), "ai.reviewStatus": "confirmed" } });
    const result = await request(`/cases/${record._id}/reopen`, requester, "POST");
    expect(result.status).toBe(200);
    const saved = await models.CaseRecord.findById(record._id).lean<any>();
    expect(saved.slaBreached).toBe(false);
    expect(saved.slaBreachedAt).toBeNull();
    expect(saved.slaStartedAt).toBeInstanceOf(Date);
    expect(saved.dueAt.getTime()).toBeGreaterThan(Date.now());
    const reopenedDueAt = saved.dueAt.getTime();
    const { runSlaCheck } = await import("../src/jobs/slaChecker.js");
    await runSlaCheck();
    const afterJob = await models.CaseRecord.findById(record._id).lean<any>();
    expect(afterJob.dueAt.getTime()).toBe(reopenedDueAt);
    expect(afterJob.slaBreached).toBe(false);
  });
  it("restarts the SLA on staff reopen and persists the breach timestamp", async () => {
    const breachedAt = new Date(0);
    await models.CaseRecord.updateOne({ _id: record._id }, { $set: { status: "closed", assigneeId: agent._id, assigneeName: agent.name, resolvedAt: new Date(), closedAt: new Date(), dueAt: breachedAt, slaBreached: true, slaBreachedAt: breachedAt, "ai.reviewStatus": "confirmed" } });
    expect((await models.CaseRecord.findById(record._id).lean<any>()).slaBreachedAt).toEqual(breachedAt);
    expect((await request(`/cases/${record._id}`, agent, "PATCH", { status: "in_progress" })).status).toBe(200);
    const saved = await models.CaseRecord.findById(record._id).lean<any>();
    expect(saved.slaBreachedAt).toBeNull();
    expect(saved.dueAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("persists AI model provenance and extracted information", async () => {
    const result = await request("/cases", requester, "POST", { title: "Need account assistance", description: "Unable to access my account in Building A", serviceKey: "general_support", priority: "normal", channel: "portal" });
    expect(result.status).toBe(201);
    expect(result.body.case.ai.processingStatus).toBe("queued");
    const { processCaseTriage } = await import("../src/jobs/caseTriage.js");
    await processCaseTriage();
    const saved = await models.CaseRecord.findOne({ title: "Need account assistance" }).lean<any>();
    expect(saved.ai.modelVersion).toBe("test-model-v2");
    expect(saved.ai.extracted.location).toBe("Building A");
  });
});
