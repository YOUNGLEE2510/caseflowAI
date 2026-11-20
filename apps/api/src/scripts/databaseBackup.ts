// Backup and restore-test for the CaseFlow database without mongodump.
//
//   npm run db:backup                                  read-only: dumps the configured database
//   npm run db:restore-test -- --from <backup dir> --target-db <new empty database>
//
// backup writes one gzip'd canonical-EJSON file per collection (types such as ObjectId and Date
// survive), each collection's indexes and a manifest with document counts and SHA-256 to the
// repository's gitignored artifacts/backups/. It never writes to the database.
//
// restore-test loads a backup into a different, empty database on the same server and checks
// every count, so the backup is proven restorable without touching the source. It refuses the
// source database name and any non-empty target. Restoring over production is deliberately not
// offered here: do that by hand, after a decision, with the restored copy as the reference.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import mongoose from "mongoose";
import { config } from "../config.js";
import { connectDatabase } from "../db.js";

const { EJSON } = mongoose.mongo.BSON;
const repositoryRoot = resolve(dirname(import.meta.filename), "../../../..");
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const databaseHost = () => { try { return new URL(config.MONGODB_URI.replace(/^mongodb(\+srv)?:/, "http:")).hostname; } catch { return "unknown"; } };

interface Manifest {
  database: string; host: string; createdAt: string;
  collections: Array<{ name: string; documents: number; file: string; sha256: string; indexes: unknown[] }>;
}

export async function backupDatabase(db: mongoose.mongo.Db, outputDir: string): Promise<Manifest> {
  await mkdir(outputDir, { recursive: true });
  const manifest: Manifest = { database: db.databaseName, host: databaseHost(), createdAt: new Date().toISOString(), collections: [] };
  // Plain collections only: views and time-series buckets are not backed up as data.
  const collections = (await db.listCollections({ type: "collection" }).toArray())
    .map(item => item.name).filter(name => !name.startsWith("system.")).sort();
  for (const name of collections) {
    const lines: string[] = [];
    for await (const document of db.collection(name).find({}, { batchSize: 500 })) lines.push(EJSON.stringify(document, { relaxed: false }));
    const data = gzipSync(Buffer.from(lines.join("\n"), "utf8"));
    const file = `${name}.ejson.gz`;
    await writeFile(join(outputDir, file), data, { mode: 0o600 });
    const indexes = (await db.collection(name).indexes()).filter(index => index.name !== "_id_");
    manifest.collections.push({ name, documents: lines.length, file, sha256: sha256(data), indexes });
  }
  // Canonical EJSON keeps BSON types inside index options (e.g. dates in partial filters).
  await writeFile(join(outputDir, "manifest.json"), EJSON.stringify(manifest, undefined, 2, { relaxed: false }), { mode: 0o600 });
  return manifest;
}

export async function restoreDatabase(target: mongoose.mongo.Db, backupDir: string) {
  // Relaxed parse: dates and ObjectIds come back as BSON types, counts as plain numbers.
  const manifest = EJSON.parse(await readFile(join(backupDir, "manifest.json"), "utf8"), { relaxed: true }) as unknown as Manifest;
  if ((await target.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error(`Target database "${target.databaseName}" is not empty.`);
  const result: Record<string, { expected: number; restored: number }> = {};
  for (const item of manifest.collections) {
    const data = await readFile(join(backupDir, item.file));
    if (sha256(data) !== item.sha256) throw new Error(`Checksum mismatch for ${item.file}.`);
    const text = gunzipSync(data).toString("utf8");
    const documents = text ? text.split("\n").map(line => EJSON.parse(line, { relaxed: false }) as mongoose.mongo.Document) : [];
    const collection = target.collection(item.name);
    await target.createCollection(item.name);
    for (let i = 0; i < documents.length; i += 1000) await collection.insertMany(documents.slice(i, i + 1000), { ordered: true });
    for (const index of item.indexes as Array<Record<string, any>>) {
      const { key, v: _v, ns: _ns, ...options } = index;
      await collection.createIndex(key, options);
    }
    result[item.name] = { expected: item.documents, restored: await collection.countDocuments() };
  }
  const mismatched = Object.entries(result).filter(([, counts]) => counts.expected !== counts.restored);
  return { source: `${manifest.host}/${manifest.database}`, backupCreatedAt: manifest.createdAt, collections: result, ok: mismatched.length === 0 };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({ args: rest, options: { from: { type: "string" }, "target-db": { type: "string" }, out: { type: "string" } } });
  await connectDatabase();
  try {
    if (command === "backup") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputDir = resolve(values.out || join(repositoryRoot, "artifacts", "backups", `${config.MONGODB_DB}-${stamp}`));
      const manifest = await backupDatabase(mongoose.connection.db!, outputDir);
      console.log(JSON.stringify({ mode: "backup (read-only)", source: `${manifest.host}/${manifest.database}`, outputDir,
        collections: Object.fromEntries(manifest.collections.map(item => [item.name, item.documents])) }, null, 2));
    } else if (command === "restore-test") {
      const targetName = values["target-db"]?.trim();
      if (!values.from || !targetName) throw new Error("Usage: restore-test --from <backup dir> --target-db <new empty database>");
      if (!/^[A-Za-z0-9_-]{1,38}$/.test(targetName)) throw new Error("--target-db must be a plain database name.");
      if (targetName === config.MONGODB_DB) throw new Error("--target-db must differ from the configured (source) database.");
      const report = await restoreDatabase(mongoose.connection.useDb(targetName, { useCache: false }).db!, resolve(values.from));
      console.log(JSON.stringify({ mode: "restore-test", target: `${databaseHost()}/${targetName}`, ...report }, null, 2));
      if (!report.ok) process.exitCode = 1;
    } else {
      throw new Error("Command must be backup or restore-test.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\.[jt]s$/, "") === resolve(import.meta.filename).replace(/\.[jt]s$/, "")) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}

