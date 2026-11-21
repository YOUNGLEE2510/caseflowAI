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
  // Collection options survive, and more than one insert batch is streamed back.
  await source.createCollection("rules", { validator: { $jsonSchema: { required: ["code"] } }, collation: { locale: "vi", strength: 2 } });
  await source.collection("rules").insertOne({ code: "R1" });
  await source.collection("bulk").insertMany(Array.from({ length: 2500 }, (_, i) => ({ i })));

  const manifest = await backupDatabase(source, dir);
  expect(manifest.collections.map(item => [item.name, item.documents])).toEqual([["bulk", 2500], ["empty", 0], ["rules", 1], ["users", 2]]);
  expect(manifest.consistentSnapshot).toBe(false); // standalone test server: no snapshot sessions

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
  const rules = (await target.listCollections({ name: "rules" }).toArray())[0] as { options?: Record<string, any> };
  expect(rules.options?.validator).toEqual({ $jsonSchema: { required: ["code"] } });
  expect(rules.options?.collation?.locale).toBe("vi");
  await expect(target.collection("rules").insertOne({ other: 1 })).rejects.toThrow();
  expect(await target.collection("bulk").countDocuments()).toBe(2500);
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

it("reads every collection from one snapshot on a replica set", async () => {
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const connection = await mongoose.createConnection(replSet.getUri(), { dbName: "snapshot_source" }).asPromise();
  const out = await mkdtemp(join(tmpdir(), "caseflow-snapshot-"));
  try {
    await connection.db!.collection("a").insertOne({ x: 1 });
    await connection.db!.collection("b").insertOne({ y: 1 });
    const manifest = await backupDatabase(connection.db!, out);
    expect(manifest.consistentSnapshot).toBe(true);
    expect(manifest.collections.map(item => [item.name, item.documents])).toEqual([["a", 1], ["b", 1]]);
  } finally {
    await connection.close();
    await replSet.stop();
    await rm(out, { recursive: true, force: true });
  }
}, 120000);
