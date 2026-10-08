import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";

vi.mock("../src/services/aiClient.js", () => ({
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

describe("tenant and privacy boundaries", () => {
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
    expect((await request("/cases", login.body.token)).status).toBe(200);
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
    const resolved = await request(`/cases/${record._id}`, agent, "PATCH", { status: "resolved" });
    const closed = await request(`/cases/${record._id}`, agent, "PATCH", { status: "closed" });
    expect(closed.body.case.resolvedAt).toBe(resolved.body.case.resolvedAt);
    expect(closed.body.case.closedAt).toBeTruthy();
    const reopened = await request(`/cases/${record._id}`, agent, "PATCH", { status: "in_progress" });
    expect(reopened.body.case).toMatchObject({ resolvedAt: null, closedAt: null, reopenCount: 1 });
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

    const updated = await request(`/knowledge/${draft.body.article._id}`, admin, "PATCH", { title: "Revised account policy" });
    expect(updated.status).toBe(200);
    expect(updated.body.article).toMatchObject({
      status: "published",
      reviewedByName: published.body.article.reviewedByName,
      reviewedAt: published.body.article.reviewedAt
    });
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
  it("records successful login, logout and case access", async () => {
    const login = await request("/auth/login", requester, "POST", { organizationSlug: org.slug, email: requester.email, password: "TestPassword123!" });
    expect(login.status).toBe(200);
    expect((await request(`/cases/${record._id}`, login.body.token)).status).toBe(200);
    expect((await request("/auth/logout", login.body.token, "POST")).status).toBe(200);
    const actions = await models.AuditLog.find({ actorId: requester._id }).select("action").lean();
    expect(actions.map((item: any) => item.action)).toEqual(expect.arrayContaining(["auth.login", "case.view", "auth.logout"]));
    const history = await request("/analytics/audit-log?action=case.view", admin);
    expect(history.status).toBe(200);
    expect(history.body.logs[0]).toMatchObject({ action: "case.view", changes: { code: record.code } });
    expect(history.body.logs[0]).not.toHaveProperty("ip");
    expect(history.body.logs[0]).not.toHaveProperty("userAgent");
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
    const saved = await models.CaseRecord.findOne({ title: "Need account assistance" }).lean<any>();
    expect(saved.ai.modelVersion).toBe("test-model-v2");
    expect(saved.ai.extracted.location).toBe("Building A");
  });
});
