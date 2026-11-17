import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASET_RESIDENT_CODE_PREFIX, DATASET_TAG, generateRentalDataset } from "../src/demo/rentalDataset.js";
import { DEPARTMENTS, RESIDENT_EMAIL_DOMAIN, STAFF, STAFF_EMAIL_DOMAIN, TEAM_BY_CATEGORY, emailLocalPart } from "../src/demo/rentalOrg.js";

const now = new Date("2026-11-17T03:00:00.000Z");
const dataset = generateRentalDataset({ now });

describe("synthetic rental dataset", () => {
  it("is deterministic for a seed and reference time", () => {
    expect(JSON.stringify(generateRentalDataset({ now }))).toBe(JSON.stringify(dataset));
    expect(JSON.stringify(generateRentalDataset({ now, seed: "other" }))).not.toBe(JSON.stringify(dataset));
  });

  it("has the medium demo scale", () => {
    expect(dataset.properties).toHaveLength(3);
    expect(dataset.units).toHaveLength(120);
    expect(dataset.assets.length).toBeGreaterThan(350);
    expect(dataset.assets.length).toBeLessThan(495); // rental page lists at most 500 assets
    expect(dataset.users.filter(user => user.role !== "requester")).toHaveLength(STAFF.length);
    expect(dataset.users.filter(user => user.role === "requester").length).toBeGreaterThan(130);
    expect(dataset.cases.length).toBeGreaterThan(780);
    expect(dataset.cases.length).toBeLessThan(1100);
    expect(dataset.incidents.length).toBeGreaterThanOrEqual(10);
    expect(dataset.tasks.length).toBeGreaterThan(120);
  });

  it("uses only fictional identities and unique keys", () => {
    expect(new Set(dataset.users.map(user => user.email)).size).toBe(dataset.users.length);
    for (const user of dataset.users) expect(user.email.endsWith(`@${user.role === "requester" ? RESIDENT_EMAIL_DOMAIN : STAFF_EMAIL_DOMAIN}`)).toBe(true);
    expect(dataset.users.filter(user => user.role === "requester").every(user => user.employeeCode.startsWith(DATASET_RESIDENT_CODE_PREFIX))).toBe(true);
    expect(new Set(dataset.cases.map(item => item.code)).size).toBe(dataset.cases.length);
    expect(new Set(dataset.assets.map(item => item.code)).size).toBe(dataset.assets.length);
    expect(dataset.properties.every(item => item.address.includes("giả lập"))).toBe(true);
    expect(dataset.cases.every(item => item.tags.includes(DATASET_TAG))).toBe(true);
  });

  it("keeps every case consistent with time, tenancy, assets and status", () => {
    const assets = new Map(dataset.assets.map(asset => [asset.code, asset]));
    const staff = new Set(dataset.users.filter(user => user.role === "agent").map(user => user.key));
    for (const item of dataset.cases) {
      expect(item.createdAt >= dataset.start && item.createdAt <= now).toBe(true);
      const tenancy = dataset.tenancies.find(entry => entry.residentKey === item.requesterKey && entry.unitCode === item.unitCode);
      expect(tenancy, item.code).toBeTruthy();
      expect(tenancy!.start <= item.createdAt && (!tenancy!.end || tenancy!.end > item.createdAt)).toBe(true);
      if (item.assetCode) {
        const asset = assets.get(item.assetCode)!;
        expect(asset.propertyCode).toBe(item.propertyCode);
        if (asset.unitCode) expect(asset.unitCode).toBe(item.unitCode);
      }
      for (let index = 1; index < item.events.length; index++) expect(item.events[index].createdAt >= item.events[index - 1].createdAt).toBe(true);
      expect(item.events.every(event => event.createdAt >= item.createdAt && event.createdAt <= now)).toBe(true);
      expect(item.comments.every(comment => comment.createdAt <= now)).toBe(true);
      if (["resolved", "closed"].includes(item.status)) expect(item.resolvedAt && item.resolvedAt >= item.createdAt && item.resolvedAt <= now).toBeTruthy();
      else expect(item.resolvedAt).toBeNull();
      if (item.status === "closed") expect(item.closedAt! >= item.resolvedAt!).toBe(true);
      if (["in_progress", "waiting"].includes(item.status)) expect(staff.has(item.assigneeKey!)).toBe(true);
      expect(item.team).toBe(TEAM_BY_CATEGORY[item.category]);
      if (item.assigneeKey) expect(dataset.users.find(user => user.key === item.assigneeKey)!.team).toBe(item.team);
      expect(Boolean(item.slaPausedAt)).toBe(item.status === "waiting");
      if (item.satisfaction !== null) expect(item.status).toBe("closed");
      if (item.status !== "new") expect(item.ai.reviewStatus).not.toBe("pending");
      if (item.ai.reviewStatus === "corrected") expect(item.ai.humanCorrectedLabel).toBe(item.category);
      expect(item.reopenCount).toBe(item.cycles.length);
    }
  });

  it("produces a realistic mix of outcomes", () => {
    const share = (predicate: (item: typeof dataset.cases[number]) => boolean) => dataset.cases.filter(predicate).length / dataset.cases.length;
    expect(share(item => item.slaBreached)).toBeGreaterThan(0.05);
    expect(share(item => item.slaBreached)).toBeLessThan(0.35);
    expect(share(item => !["resolved", "closed"].includes(item.status))).toBeGreaterThan(0.02);
    expect(share(item => item.reopenCount > 0)).toBeGreaterThan(0.01);
    expect(share(item => item.satisfaction !== null)).toBeGreaterThan(0.3);
    expect(new Set(dataset.cases.map(item => item.channel)).size).toBe(4);
    expect(new Set(dataset.cases.map(item => item.category)).size).toBe(6);
  });

  it("links incident cases within one property and never to two incidents", () => {
    const seen = new Set<string>();
    for (const incident of dataset.incidents) {
      expect(incident.caseCodes.length).toBeGreaterThanOrEqual(2);
      for (const code of incident.caseCodes) {
        expect(seen.has(code)).toBe(false);
        seen.add(code);
        expect(dataset.cases.find(item => item.code === code)!.propertyCode).toBe(incident.propertyCode);
      }
      if (incident.resolvedAt) expect(incident.resolvedAt >= incident.detectedAt).toBe(true);
    }
    expect(dataset.incidents.some(incident => incident.status !== "resolved")).toBe(true);
  });
});

describe("rental dataset setup tool", () => {
  const run = promisify(execFile);
  let database: MongoMemoryServer;
  let directory: string;
  let env: NodeJS.ProcessEnv;
  const script = (name: string) => fileURLToPath(new URL(`../src/${name}`, import.meta.url));
  beforeAll(async () => {
    database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    directory = await mkdtemp(join(tmpdir(), "caseflow-dataset-test-"));
    await mongoose.connect(database.getUri(), { dbName: "rental_dataset_test" });
    env = { ...process.env, NODE_ENV: "test", DEPLOYMENT_MODE: "local", AUTO_SEED: "false", MONGODB_URI: database.getUri(),
      MONGODB_DB: "rental_dataset_test", JWT_SECRET: "rental-dataset-test-secret-not-for-deployment",
      RENTAL_CREDENTIALS_FILE: join(directory, "credentials.json"), RENTAL_DATASET_NOW: now.toISOString() };
    await run(process.execPath, ["--import", "tsx", script("rentalSetup.ts")], { env: { ...env, RENTAL_SETUP_CONFIRM: "caseflow-rental-demo" }, timeout: 60000 });
  }, 180000);
  afterAll(async () => {
    await mongoose.disconnect();
    await database?.stop();
    if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith("caseflow-dataset-test-")) await rm(directory, { recursive: true, force: true });
  });

  it("dry-runs by default, writes once on confirmation and replaces only synthetic records", async () => {
    const db = mongoose.connection.db!;
    const org = await db.collection("organizations").findOne({ slug: "caseflow-rental-demo" });
    const isolation = await db.collection("organizations").findOne({ slug: "caseflow-rental-isolation-demo" });
    const baselineCases = await db.collection("caserecords").countDocuments();

    const dry = await run(process.execPath, ["--import", "tsx", script("rentalDatasetSetup.ts")], { env, timeout: 60000 });
    expect(JSON.parse(dry.stdout).mode).toBe("dry-run");
    expect(await db.collection("caserecords").countDocuments()).toBe(baselineCases);

    const confirmed = { ...env, RENTAL_DATASET_CONFIRM: "caseflow-rental-demo" };
    await run(process.execPath, ["--import", "tsx", script("rentalDatasetSetup.ts")], { env: confirmed, timeout: 120000 });
    const synthetic = await db.collection("caserecords").countDocuments({ organizationId: org!._id, tags: DATASET_TAG });
    expect(synthetic).toBe(dataset.cases.length);
    expect(await db.collection("incidents").countDocuments({ organizationId: org!._id, code: /^SIM-INC-/ })).toBe(dataset.incidents.length);
    expect(await db.collection("caserecords").countDocuments({ organizationId: isolation!._id })).toBe(0);
    const sample = await db.collection("caserecords").findOne({ organizationId: org!._id, tags: DATASET_TAG, status: "closed" });
    expect(sample!.createdAt.getTime()).toBeLessThan(now.getTime());
    expect(sample!.searchTokens.length).toBeGreaterThan(0);
    expect(sample!.deliveryEvents || []).toHaveLength(0);
    const unit = await db.collection("rentalunits").findOne({ organizationId: org!._id, residentIds: { $ne: [] }, propertyCode: "SIM-Q7" });
    expect(await db.collection("users").countDocuments({ _id: { $in: unit!.residentIds }, role: "requester" })).toBe(unit!.residentIds.length);
    const credentials = JSON.parse(await readFile(env.RENTAL_CREDENTIALS_FILE!, "utf8")).credentials as { email: string }[];
    expect(credentials.filter(item => item.email.endsWith(`@${STAFF_EMAIL_DOMAIN}`))).toHaveLength(STAFF.length);
    expect(credentials.some(item => item.email.endsWith(`@${RESIDENT_EMAIL_DOMAIN}`) && item.email.startsWith("dang.quan"))).toBe(true);

    await db.collection("caserecords").updateOne({ organizationId: org!._id, code: "RENTAL-DEMO-001" }, { $set: { title: "Hand-edited demo case" } });
    await expect(run(process.execPath, ["--import", "tsx", script("rentalDatasetSetup.ts")], { env: confirmed, timeout: 60000 })).rejects.toThrow();
    expect(await db.collection("caserecords").countDocuments({ organizationId: org!._id, tags: DATASET_TAG })).toBe(synthetic);

    await run(process.execPath, ["--import", "tsx", script("rentalDatasetSetup.ts")], { env: { ...confirmed, RENTAL_DATASET_REPLACE: DATASET_TAG }, timeout: 120000 });
    expect(await db.collection("caserecords").countDocuments({ organizationId: org!._id, tags: DATASET_TAG })).toBe(synthetic);
    expect(await db.collection("users").countDocuments({ organizationId: org!._id, employeeCode: /^SIM-CD/ })).toBe(dataset.users.filter(user => user.role === "requester").length);
    expect(await db.collection("users").countDocuments({ organizationId: org!._id, role: { $ne: "requester" } })).toBe(STAFF.length);
    // Department structure: every service routes to one department, and every department has staff.
    for (const team of Object.values(DEPARTMENTS)) expect(await db.collection("users").countDocuments({ organizationId: org!._id, team })).toBeGreaterThan(0);
    expect(emailLocalPart("Nguyễn Gia Trang")).toBe("nguyen.trang");
    expect(emailLocalPart("Kim Ji-woo")).toBe("kim.jiwoo");
    const board = await db.collection("rentalunits").find({ organizationId: org!._id, propertyCode: { $regex: /^SIM-/ } }).toArray();
    for (const unit of board) {
      if (["occupied", "notice"].includes(unit.occupancyStatus)) expect(unit.residentIds.length).toBeGreaterThan(0);
      if (unit.occupancyStatus === "vacant") expect(unit.residentIds).toHaveLength(0);
    }
    expect(new Set(board.map(unit => unit.readinessStatus)).size).toBeGreaterThanOrEqual(3);
    expect((await db.collection("caserecords").findOne({ code: "RENTAL-DEMO-001" }))!.title).toBe("Hand-edited demo case");
    expect(await db.collection("caserecords").countDocuments({ organizationId: org!._id, code: /^RENTAL-DEMO-/ })).toBe(10);
  }, 300000);
});
