import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, expect, it } from "vitest";
import { backupDatabase, restoreDatabase } from "../src/scripts/databaseBackup.js";

let server: MongoMemoryServer;
let dir: string;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: "backup_source" });
  dir = await mkdtemp(join(tmpdir(), "caseflow-backup-"));
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
  await rm(dir, { recursive: true, force: true });
});

it("backs up and restores documents with their BSON types and indexes into an empty database", async () => {
  const source = mongoose.connection.db!;
  const id = new mongoose.Types.ObjectId();
  const at = new Date("2026-11-20T08:00:00.000Z");
  await source.collection("users").insertMany([{ _id: id, email: "a@x.test", joinedAt: at, n: 1 }, { email: "b@x.test", n: 2.5 }]);
  await source.collection("users").createIndex({ email: 1 }, { unique: true, name: "email_unique" });
  await source.collection("users").createIndex({ n: 1 }, { name: "recent_only", partialFilterExpression: { joinedAt: { $gte: new Date("2026-01-01T00:00:00.000Z") } } });
  await source.createCollection("users_view", { viewOn: "users", pipeline: [] });
  await source.collection("empty").insertOne({ x: 1 });
  await source.collection("empty").deleteMany({});

  const manifest = await backupDatabase(source, dir);
  expect(manifest.collections.map(item => [item.name, item.documents])).toEqual([["empty", 0], ["users", 2]]);

  const target = mongoose.connection.useDb("backup_restore", { useCache: false }).db!;
  const report = await restoreDatabase(target, dir);
  expect(report.ok).toBe(true);
  const restored = await target.collection("users").findOne({ _id: id });
  expect(restored?._id).toBeInstanceOf(mongoose.Types.ObjectId);
  expect(restored?.joinedAt).toBeInstanceOf(Date);
  expect(restored?.joinedAt.toISOString()).toBe(at.toISOString());
  expect((await target.collection("users").indexes()).find(index => index.name === "email_unique")?.unique).toBe(true);
  const partial = (await target.collection("users").indexes()).find(index => index.name === "recent_only");
  expect(partial?.partialFilterExpression?.joinedAt?.$gte).toBeInstanceOf(Date);
  expect(manifest.collections.map(item => item.name)).not.toContain("users_view");
  expect(await target.collection("empty").countDocuments()).toBe(0);

  // A second restore into the same (now non-empty) database is refused.
  await expect(restoreDatabase(target, dir)).rejects.toThrow(/not empty/);
});

it("refuses a backup whose file no longer matches its checksum", async () => {
  const file = join(dir, "users.ejson.gz");
  const original = await readFile(file);
  await writeFile(file, Buffer.concat([original, Buffer.from([0])]));
  const target = mongoose.connection.useDb("backup_tampered", { useCache: false }).db!;
  await expect(restoreDatabase(target, dir)).rejects.toThrow(/Checksum mismatch/);
  await writeFile(file, original);
});
