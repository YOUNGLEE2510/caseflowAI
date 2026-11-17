import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";

vi.mock("../src/services/aiClient.js", () => ({
  fallbackClassify: () => ({ modelVersion: "fallback-v1", label: "appliances", confidence: 0.4, summary: "Air conditioner", extracted: {}, topCandidates: [], provider: "fallback" }),
  classifyText: async () => ({ modelVersion: "test", label: "appliances", confidence: 0.8, summary: "Air conditioner", extracted: {}, topCandidates: [], provider: "test" }),
  findSimilarCases: async () => [],
  findRelatedCases: async () => [],
  predictSla: async () => ({ riskScore: 0.1, factors: [] }),
  retrieveKnowledge: async () => ({ answer: "", citations: [] })
}));

const secret = "qr-intake-test-secret-not-for-production";
const team = "Vận hành căn hộ";
let database: MongoMemoryServer;
let server: Server;
let base: string;
let models: typeof import("../src/models.js");
let rental: typeof import("../src/models/rental.js");
let qr: typeof import("../src/services/qrIntake.js");
const people: Record<string, any> = {};
let orgA: any, orgB: any;

const bearer = (user: any) => jwt.sign({ id: String(user._id), organizationId: String(user.organizationId), tokenVersion: 0 }, secret, { expiresIn: "1h" });
async function call(path: string, user: any | null, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(user ? { Authorization: `Bearer ${bearer(user)}` } : {}) } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, raw: text };
}
const report = (token: string, body: Record<string, unknown>) => call(`/public/qr/${token}/reports`, null, "POST", body);
const valid = { name: "Nguyễn Văn Khách", phone: "0901 234 567", description: "Điều hòa phòng ngủ không lạnh từ tối qua." };
async function issue(unitCode: string, user = people.managerA) {
  const result = await call(`/rental/units/TOWER-A/${unitCode}/qr`, user, "POST");
  expect(result.status).toBe(201);
  return String(result.body.path).replace("/r/", "");
}

beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  vi.stubEnv("MONGODB_URI", database.getUri());
  vi.stubEnv("MONGODB_DB", "caseflow_qr_test");
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("AUTO_SEED", "false");
  vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "10000");
  const { app } = await import("../src/app.js");
  models = await import("../src/models.js");
  rental = await import("../src/models/rental.js");
  qr = await import("../src/services/qrIntake.js");
  await mongoose.connect(database.getUri(), { dbName: "caseflow_qr_test" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;

  orgA = await models.Organization.create({ slug: "qr-a", name: "Căn hộ A", settings: { serviceDomain: "rental" } });
  orgB = await models.Organization.create({ slug: "qr-b", name: "Căn hộ B", settings: { serviceDomain: "rental" } });
  for (const org of [orgA, orgB]) {
    for (const key of ["appliances", "general_support"]) await models.ServiceDefinition.create({ organizationId: org._id, key, name: key, category: key, team, slaHours: 24, active: true });
    await rental.RentalProperty.create({ organizationId: org._id, code: "TOWER-A", name: `Tòa ${org.slug}`, active: true });
  }
  const make = (key: string, org: any, role: string) => models.User.create({ organizationId: org._id, email: `${key}@qr.test`, name: `Người ${key}`,
    role, team: role === "requester" ? "" : team, passwordHash: "x".repeat(60), active: true });
  people.managerA = await make("manager-a", orgA, "manager");
  people.agentA = await make("agent-a", orgA, "agent");
  people.residentA = await make("resident-a", orgA, "requester");
  people.neighbourA = await make("neighbour-a", orgA, "requester");
  people.managerB = await make("manager-b", orgB, "manager");
  for (const code of ["A301", "A302", "A303", "A304", "A305"]) {
    await rental.RentalUnit.create({ organizationId: orgA._id, propertyCode: "TOWER-A", code, floor: "3", residentIds: code === "A301" ? [people.residentA._id] : [people.neighbourA._id] });
  }
  await rental.RentalUnit.create({ organizationId: orgB._id, propertyCode: "TOWER-A", code: "A301", floor: "3", residentIds: [] });
}, 180000);

afterAll(async () => {
  server?.close();
  await mongoose.disconnect();
  await database?.stop();
  vi.unstubAllEnvs();
});

describe("QR tokens", () => {
  it("bind organization, unit and version", () => {
    const unitId = new mongoose.Types.ObjectId().toHexString();
    const org = new mongoose.Types.ObjectId().toHexString();
    const token = qr.signQrToken(org, unitId, 3);
    const parsed = qr.parseQrToken(token)!;
    expect(parsed).toMatchObject({ unitId, version: 3 });
    expect(qr.verifyQrSignature(parsed, org)).toBe(true);
    expect(qr.verifyQrSignature(parsed, new mongoose.Types.ObjectId().toHexString())).toBe(false);
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "AB" : "AA"}`;
    expect(qr.parseQrToken(tampered) && qr.verifyQrSignature(qr.parseQrToken(tampered)!, org)).toBeFalsy();
    expect(qr.parseQrToken("not-a-token")).toBeNull();
    expect(qr.normalizePhone("+84 901.234-567")).toBe("0901234567");
  });
});

describe("QR code management", () => {
  it("is limited to managers of the same organization", async () => {
    expect((await call("/rental/units/TOWER-A/A301/qr", people.agentA)).status).toBe(403);
    expect((await call("/rental/units/TOWER-A/A301/qr", people.residentA, "POST")).status).toBe(403);
    expect((await call("/rental/units/TOWER-A/A302/qr", people.managerB)).status).toBe(404);
    const before = await call("/rental/units/TOWER-A/A301/qr", people.managerA);
    expect(before.body).toMatchObject({ enabled: false, path: null });
  });

  it("rotates and disables printed codes", async () => {
    const first = await issue("A305");
    expect((await call(`/public/qr/${first}`, null)).status).toBe(200);
    const second = await issue("A305");
    expect(second).not.toBe(first);
    expect((await call(`/public/qr/${first}`, null)).status).toBe(404);
    expect((await call("/rental/units/TOWER-A/A305/qr", people.managerA, "DELETE")).status).toBe(204);
    expect((await call(`/public/qr/${second}`, null)).status).toBe(404);
    const third = await issue("A305");
    expect([first, second]).not.toContain(third);
    expect((await call(`/public/qr/${third}`, null)).status).toBe(200);
  });
});

describe("public QR intake", () => {
  it("rejects QR lookups and reports when the organization is suspended", async () => {
    const token = await issue("A305");
    const before = await models.CaseRecord.countDocuments({ organizationId: orgA._id });
    await models.Organization.updateOne({ _id: orgA._id }, { $set: { status: "suspended" } });
    try {
      expect((await call(`/public/qr/${token}`, null)).status).toBe(404);
      expect((await report(token, { ...valid, phone: "0948211111" })).status).toBe(404);
      expect(await models.CaseRecord.countDocuments({ organizationId: orgA._id })).toBe(before);
    } finally { await models.Organization.updateOne({ _id: orgA._id }, { $set: { status: "active" } }); }
  });

  it("does not deduplicate reports across properties with the same unit code", async () => {
    await rental.RentalProperty.create({ organizationId: orgA._id, code: "TOWER-B", name: "Tower B", active: true });
    const tokens: string[] = [];
    for (const propertyCode of ["TOWER-A", "TOWER-B"]) {
      const unit = await rental.RentalUnit.create({ organizationId: orgA._id, propertyCode, code: "SAME301", qrEnabled: true, qrVersion: 1 });
      tokens.push(qr.signQrToken(String(orgA._id), String(unit._id), 1));
    }
    const payload = { ...valid, phone: "0948222222" };
    const first = await report(tokens[0], payload);
    const second = await report(tokens[1], payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.code).not.toBe(first.body.code);
    const replay = await report(tokens[1], payload);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ code: second.body.code, duplicate: true });
  });

  it("shows the unit without resident details and rejects forged codes", async () => {
    const token = await issue("A301");
    const info = await call(`/public/qr/${token}`, null);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ organizationName: "Căn hộ A", propertyName: "Tòa qr-a", unitCode: "A301" });
    expect(info.raw).not.toContain(people.residentA.name);
    expect(info.raw).not.toContain(String(orgA._id));
    // A code signed for organization B cannot open a unit of organization A.
    const unitA = await rental.RentalUnit.findOne({ organizationId: orgA._id, code: "A301" }).lean<any>();
    const forged = qr.signQrToken(String(orgB._id), String(unitA._id), unitA.qrVersion);
    expect((await call(`/public/qr/${forged}`, null)).status).toBe(404);
    expect((await call("/public/qr/bad.token", null)).status).toBe(404);
  });

  it("creates an unverified case that cannot be assigned before verification", async () => {
    const token = await issue("A301");
    const created = await report(token, { ...valid, category: "appliances" });
    expect(created.status).toBe(201);
    const record = await models.CaseRecord.findOne({ code: created.body.code }).lean<any>();
    expect(record).toMatchObject({ channel: "qr", status: "new", unitCode: "A301", propertyCode: "TOWER-A", serviceKey: "appliances",
      intakeVerification: { status: "pending", reporterName: valid.name, reporterPhone: "0901234567" } });
    expect(String(record.organizationId)).toBe(String(orgA._id));
    const placeholder = await models.User.findById(record.requesterId).lean<any>();
    expect(placeholder).toMatchObject({ role: "requester", active: false });

    const duplicate = await report(token, valid);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body).toMatchObject({ code: created.body.code, duplicate: true });

    const id = String(record._id);
    expect((await call(`/cases/${id}`, people.agentA, "PATCH", { assigneeId: String(people.agentA._id) })).status).toBe(422);
    expect((await call(`/cases/${id}`, people.managerA, "PATCH", { confirmAi: true, priority: "high" })).status).toBe(200);
    expect((await call(`/cases/${id}`, people.managerA, "PATCH", { status: "in_progress" })).status).toBe(422);

    // Linking someone who does not live in this unit is refused.
    expect((await call(`/cases/${id}/intake-verification`, people.managerA, "POST",
      { decision: "verified", residentId: String(people.neighbourA._id), note: "Đã gọi lại" })).status).toBe(422);
    expect((await call(`/cases/${id}/intake-verification`, people.managerB, "POST", { decision: "verified", note: "Đã gọi lại" })).status).toBe(404);
    const residents = await call(`/cases/${id}/intake-verification/residents`, people.agentA);
    expect(residents.body.residents.map((item: any) => item.name)).toEqual([people.residentA.name]);

    const verified = await call(`/cases/${id}/intake-verification`, people.agentA, "POST",
      { decision: "verified", residentId: String(people.residentA._id), note: "Đã gọi lại, khách xác nhận ở căn" });
    expect(verified.status).toBe(200);
    expect(verified.body.case.events.find((event: any) => event.type === "intake_verified").metadata.note).toBe("Đã gọi lại, khách xác nhận ở căn");
    expect(verified.body.case.requesterId).toBe(String(people.residentA._id));
    expect((await call(`/cases/${id}/intake-verification`, people.agentA, "POST", { decision: "rejected", note: "Thử lại" })).status).toBe(409);
    expect((await call(`/cases/${id}`, people.agentA, "PATCH", { assigneeId: String(people.agentA._id) })).status).toBe(200);

    // The linked resident now sees the case, without staff notes or the callback number.
    const own = await call(`/cases/${id}`, people.residentA);
    expect(own.status).toBe(200);
    expect(own.body.case.intakeVerification).toEqual({ status: "verified" });
    expect(own.raw).not.toContain("0901234567");
    expect(own.raw).not.toContain("Đã gọi lại, khách xác nhận ở căn");

    const audits = await models.AuditLog.find({ resourceId: id }).lean();
    expect(JSON.stringify(audits)).not.toContain("0901234567");
  });

  it("closes rejected submissions", async () => {
    const token = await issue("A302");
    const created = await report(token, { ...valid, phone: "0912345678", description: "Có người lạ gửi nội dung không liên quan đến căn." });
    const record = await models.CaseRecord.findOne({ code: created.body.code }).lean<any>();
    const rejected = await call(`/cases/${record._id}/intake-verification`, people.managerA, "POST", { decision: "rejected", note: "Gọi hai lần không liên lạc được" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.case).toMatchObject({ status: "closed", intakeVerification: { status: "rejected" } });
  });

  it("validates input and limits abuse", async () => {
    const token = await issue("A303");
    expect((await report(token, { ...valid, website: "http://spam.example" })).status).toBe(400);
    expect((await report(token, { ...valid, phone: "12345" })).status).toBe(400);
    expect((await report(token, { ...valid, requesterId: String(people.residentA._id) })).status).toBe(400);
    expect((await report(token, { ...valid, description: "ngắn" })).status).toBe(400);
    // Six attempts per code per hour, counting the rejected ones above.
    expect((await report(token, { ...valid, phone: "0933333333" })).status).toBe(201);
    expect((await report(token, { ...valid, phone: "0933333333", description: "Bình nóng lạnh không nóng nữa." })).status).toBe(201);
    expect((await report(token, { ...valid, phone: "0933333333", description: "Khóa cửa báo pin yếu liên tục." })).status).toBe(429);

    // The same phone is limited across units of the organization.
    const other = await issue("A304");
    for (let index = 0; index < 3; index += 1) {
      expect((await report(other, { ...valid, phone: "0933333333", description: `Phản ánh thứ ${index + 1} về thiết bị trong căn.` })).status).toBe(201);
    }
    expect((await report(other, { ...valid, phone: "0933333333", description: "Phản ánh thứ sáu trong ngày." })).status).toBe(429);
  });
});
