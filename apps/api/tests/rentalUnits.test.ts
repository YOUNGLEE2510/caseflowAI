import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";

const secret = "unit-board-test-secret-not-for-production";
let database: MongoMemoryServer;
let server: Server;
let base: string;
const people: Record<string, any> = {};

const bearer = (user: any) => jwt.sign({ id: String(user._id), organizationId: String(user.organizationId), tokenVersion: 0 }, secret, { expiresIn: "1h" });
async function call(path: string, user: any, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer(user)}` } });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
const status = (unit: string, user: any, body: Record<string, unknown>) => call(`/rental/units/TOWER-A/${unit}/status`, user, "PATCH", body);

beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  vi.stubEnv("MONGODB_URI", database.getUri());
  vi.stubEnv("MONGODB_DB", "caseflow_units_test");
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("AUTO_SEED", "false");
  vi.stubEnv("API_RATE_LIMIT_PER_MINUTE", "10000");
  const { app } = await import("../src/app.js");
  const models = await import("../src/models.js");
  const rental = await import("../src/models/rental.js");
  await mongoose.connect(database.getUri(), { dbName: "caseflow_units_test" });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  base = `http://127.0.0.1:${address.port}`;
  const orgA = await models.Organization.create({ slug: "units-a", name: "A" });
  const orgB = await models.Organization.create({ slug: "units-b", name: "B" });
  const make = (key: string, org: any, role: string, team = "Buồng phòng") => models.User.create({ organizationId: org._id, email: `${key}@units.test`,
    name: key, role, team: role === "requester" ? "" : team, passwordHash: "x".repeat(60), active: true });
  people.manager = await make("manager", orgA, "manager", "Ban điều hành");
  people.housekeeper = await make("housekeeper", orgA, "agent");
  people.tenant = await make("tenant", orgA, "requester");
  people.outsider = await make("outsider", orgB, "manager");
  await rental.RentalProperty.create({ organizationId: orgA._id, code: "TOWER-A", name: "Tower A", active: true });
  await rental.RentalUnit.create([
    { organizationId: orgA._id, propertyCode: "TOWER-A", code: "A301", residentIds: [people.tenant._id], occupancyStatus: "occupied", readinessStatus: "ready" },
    { organizationId: orgA._id, propertyCode: "TOWER-A", code: "A302", residentIds: [], occupancyStatus: "vacant", readinessStatus: "needs_cleaning" },
    { organizationId: orgA._id, propertyCode: "TOWER-A", code: "A303", residentIds: [], occupancyStatus: "vacant", readinessStatus: "ready" }
  ]);
  await models.CaseRecord.create({ organizationId: orgA._id, code: "U-1", title: "Leak", description: "Water leak in bathroom", serviceKey: "water",
    category: "water", requesterId: people.tenant._id, requesterName: "tenant", team: "Kỹ thuật điện nước", dueAt: new Date(Date.now() + 3600000),
    propertyCode: "TOWER-A", unitCode: "A301" });
}, 180000);

afterAll(async () => {
  server?.close();
  await mongoose.disconnect();
  await database?.stop();
  vi.unstubAllEnvs();
});

describe("unit board", () => {
  it("summarises letting and readiness for staff only", async () => {
    const board = await call("/rental/units", people.housekeeper);
    expect(board.status).toBe(200);
    expect(board.body.summary).toMatchObject({ total: 3, rentable: 1, occupancy: { occupied: 1, vacant: 2 }, readiness: { needs_cleaning: 1, ready: 2 } });
    expect(board.body.units.find((unit: any) => unit.code === "A301")).toMatchObject({ residentCount: 1, openCases: 1, rentable: false });
    expect((await call("/rental/units", people.tenant)).status).toBe(403);
    expect((await call("/rental/units", people.outsider)).body.units).toHaveLength(0);
    expect((await status("A302", people.outsider, { readinessStatus: "cleaned", note: "Đã dọn" })).status).toBe(404);
  });

  it("lets field staff report cleaning but not change who holds the unit", async () => {
    expect((await status("A302", people.housekeeper, { occupancyStatus: "reserved", note: "Khách cọc" })).status).toBe(403);
    expect((await status("A302", people.housekeeper, { readinessStatus: "cleaned", note: "Đã dọn xong" })).status).toBe(204);
    expect((await status("A302", people.housekeeper, { readinessStatus: "cleaned", note: "Lặp lại" })).status).toBe(422);
    const detail = await call("/rental/units/TOWER-A/A302/status", people.housekeeper);
    expect(detail.body.history[0]).toMatchObject({ axis: "readiness", from: "needs_cleaning", to: "cleaned", actorName: "housekeeper" });
    expect(detail.body.residents).toEqual([]);
  });

  it("keeps occupancy consistent with tenants and checks out a unit", async () => {
    expect((await status("A303", people.manager, { occupancyStatus: "occupied", note: "Nhầm" })).status).toBe(422);
    expect((await status("A301", people.manager, { occupancyStatus: "vacant", note: "Trả căn" })).status).toBe(422);
    expect((await status("A301", people.manager, { occupancyStatus: "notice", availableFrom: "2026-12-31", note: "Báo trả căn" })).status).toBe(204);
    expect((await status("A301", people.manager, { occupancyStatus: "vacant", releaseResidents: true, note: "Đã bàn giao" })).status).toBe(204);
    const board = await call("/rental/units", people.manager);
    expect(board.body.units.find((unit: any) => unit.code === "A301")).toMatchObject({ occupancyStatus: "vacant", readinessStatus: "needs_cleaning", residentCount: 0, rentable: false });
    // The released tenant can no longer report for the unit.
    const create = await call("/cases", people.tenant, "POST", { description: "Nước yếu trong căn từ sáng", propertyCode: "TOWER-A", unitCode: "A301" });
    expect(create.status).toBe(403);
    const history = await call("/rental/units/TOWER-A/A301/status", people.manager);
    expect(history.body.history.map((item: any) => `${item.axis}:${item.to}`)).toEqual(["readiness:needs_cleaning", "occupancy:vacant", "occupancy:notice"]);
  });
});
