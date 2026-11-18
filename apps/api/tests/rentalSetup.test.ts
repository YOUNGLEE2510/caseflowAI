import { afterAll, beforeAll, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
let database: MongoMemoryServer;
let directory: string;
beforeAll(async () => {
  database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  directory = await mkdtemp(join(tmpdir(), "caseflow-seed-test-"));
  await mongoose.connect(database.getUri(), { dbName: "rental_seed_test" });
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await database?.stop();
  if (directory && dirname(resolve(directory)) === resolve(tmpdir()) && basename(directory).startsWith("caseflow-seed-test-")) await rm(directory, { recursive: true, force: true });
});
it("seeds portable credentials, an admin and chronological cases without overwriting existing data", async () => {
  const credentialsFile = join(directory, "credentials.json");
  const env = { ...process.env, NODE_ENV: "test", DEPLOYMENT_MODE: "local", AUTO_SEED: "false", MONGODB_URI: database.getUri(), MONGODB_DB: "rental_seed_test", JWT_SECRET: "rental-seed-test-secret-not-for-deployment", RENTAL_SETUP_CONFIRM: "caseflow-rental", RENTAL_CREDENTIALS_FILE: credentialsFile };
  const script = fileURLToPath(new URL("../src/rentalSetup.ts", import.meta.url));
  await run(process.execPath, ["--import", "tsx", script], { env, timeout: 60000 });
  const db = mongoose.connection.db!;
  const org = await db.collection("organizations").findOne({ slug: "caseflow-rental" });
  expect(org).toBeTruthy();
  expect(await db.collection("users").countDocuments({ organizationId: org!._id, role: "org_admin" })).toBe(1);
  const cases = await db.collection("caserecords").find({ organizationId: org!._id }).toArray();
  expect(cases).toHaveLength(10);
  for (const item of cases.filter(item => item.resolvedAt)) {
    expect(item.createdAt.getTime()).toBeLessThan(item.resolvedAt.getTime());
    if (item.closedAt) expect(item.resolvedAt.getTime()).toBeLessThanOrEqual(item.closedAt.getTime());
  }
  const credentials = JSON.parse(await readFile(credentialsFile, "utf8"));
  expect(credentials.credentials.some((item: { email: string }) => item.email === "tran.khoa@canho.local")).toBe(true);
  // Staff are split into departments, each service routed to one of them.
  expect(await db.collection("users").countDocuments({ organizationId: org!._id, role: { $ne: "requester" } })).toBe(19);
  expect(new Set((await db.collection("servicedefinitions").find({ organizationId: org!._id }).toArray()).map(item => item.team)).size).toBe(5);
  expect(await db.collection("rentalunits").countDocuments({ organizationId: org!._id, occupancyStatus: "vacant", readinessStatus: "ready", residentIds: { $size: 0 } })).toBe(1);
  await db.collection("caserecords").updateOne({ _id: cases[0]._id }, { $set: { title: "Preserve existing edits" } });
  await run(process.execPath, ["--import", "tsx", script], { env, timeout: 60000 });
  expect(await db.collection("caserecords").countDocuments({ organizationId: org!._id })).toBe(10);
  expect((await db.collection("caserecords").findOne({ _id: cases[0]._id }))!.title).toBe("Preserve existing edits");
  expect(JSON.parse(await readFile(credentialsFile, "utf8")).credentials.length).toBe(credentials.credentials.length);
}, 180000);
