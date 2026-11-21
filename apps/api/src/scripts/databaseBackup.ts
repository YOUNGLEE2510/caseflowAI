// Backup and restore-test for the CaseFlow database without mongodump.
//
//   npm run db:backup                                  read-only: dumps the configured database
//   npm run db:restore-test -- --from <backup dir> --target-db <new empty database>
//
// backup streams one gzip'd canonical-EJSON file per collection (types such as ObjectId and Date
// survive), with each collection's options and indexes and a manifest holding document counts and
// SHA-256, to the repository's gitignored artifacts/backups/. It never writes to the database.
// On a replica set (Atlas) all collections are read from one snapshot so they agree with each
// other; on a standalone server that is not available and the manifest says so
// ("consistentSnapshot": false): back up while nobody is writing.
//
// restore-test loads a backup into a different, empty database on the same server and checks
// every count, so the backup is proven restorable without touching the source. It refuses the
// source database and any non-empty target. Restoring over production is deliberately not offered
// here: do that by hand, after a decision, with the restored copy as the reference.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { createGunzip, createGzip } from "node:zlib";
import mongoose from "mongoose";
import { config } from "../config.js";
import { connectDatabase } from "../db.js";

const { EJSON } = mongoose.mongo.BSON;
const repositoryRoot = resolve(dirname(import.meta.filename), "../../../..");
const databaseHost = () => { try { return new URL(config.MONGODB_URI.replace(/^mongodb(\+srv)?:/, "http:")).hostname; } catch { return "unknown"; } };

async function fileSha256(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

interface ManifestCollection {
  name: string; documents: number; file: string; sha256: string;
  /** createCollection options (validator, collation, capped…), without the server-managed uuid. */
  options: Record<string, unknown>;
  indexes: unknown[];
}
interface Manifest { database: string; host: string; createdAt: string; consistentSnapshot: boolean; collections: ManifestCollection[] }

/** A snapshot session where the server supports it (replica sets), otherwise none. */
async function snapshotSession(db: mongoose.mongo.Db, probeCollection?: string) {
  if (!probeCollection) return undefined;
  const session = db.client.startSession({ snapshot: true });
  try {
    await db.collection(probeCollection).findOne({}, { session });
    return session;
  } catch {
    await session.endSession();
    return undefined;
  }
}

export async function backupDatabase(db: mongoose.mongo.Db, outputDir: string): Promise<Manifest> {
  await mkdir(outputDir, { recursive: true });
  // Plain collections only: views and time-series buckets are not backed up as data.
  const listed = (await db.listCollections({ type: "collection" }).toArray())
    .filter(item => !item.name.startsWith("system.")).sort((a, b) => a.name.localeCompare(b.name));
  const session = await snapshotSession(db, listed[0]?.name);
  const manifest: Manifest = { database: db.databaseName, host: databaseHost(), createdAt: new Date().toISOString(),
    consistentSnapshot: Boolean(session), collections: [] };
  try {
    for (const item of listed) {
      const file = `${item.name}.ejson.gz`;
      const path = join(outputDir, file);
      let documents = 0;
      // Stream documents straight to the gzip file so large collections never sit in memory.
      async function* lines() {
        for await (const document of db.collection(item.name).find({}, { batchSize: 500, session })) {
          yield `${documents ? "\n" : ""}${EJSON.stringify(document, { relaxed: false })}`;
          documents += 1;
        }
      }
      await pipeline(Readable.from(lines()), createGzip(), createWriteStream(path, { mode: 0o600 }));
      const { uuid: _uuid, ...options } = (item as { options?: Record<string, unknown> }).options || {};
      const indexes = (await db.collection(item.name).indexes()).filter(index => index.name !== "_id_");
      manifest.collections.push({ name: item.name, documents, file, sha256: await fileSha256(path), options, indexes });
    }
  } finally {
    await session?.endSession();
  }
  // Canonical EJSON keeps BSON types inside index and collection options (e.g. dates in filters).
  await writeFile(join(outputDir, "manifest.json"), EJSON.stringify(manifest, undefined, 2, { relaxed: false }), { mode: 0o600 });
  return manifest;
}

export async function restoreDatabase(target: mongoose.mongo.Db, backupDir: string) {
  // Relaxed parse: dates and ObjectIds come back as BSON types, counts as plain numbers.
  const manifest = EJSON.parse(await readFile(join(backupDir, "manifest.json"), "utf8"), { relaxed: true }) as unknown as Manifest;
  if ((await target.listCollections({}, { nameOnly: true }).toArray()).length) throw new Error(`Target database "${target.databaseName}" is not empty.`);
  // Check every file before writing anything.
  for (const item of manifest.collections) {
    if (await fileSha256(join(backupDir, item.file)) !== item.sha256) throw new Error(`Checksum mismatch for ${item.file}.`);
  }
  const result: Record<string, { expected: number; restored: number }> = {};
  for (const item of manifest.collections) {
    await target.createCollection(item.name, (item.options || {}) as mongoose.mongo.CreateCollectionOptions);
    const collection = target.collection(item.name);
    let batch: mongoose.mongo.Document[] = [];
    const lines = createInterface({ input: createReadStream(join(backupDir, item.file)).pipe(createGunzip()), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      batch.push(EJSON.parse(line, { relaxed: false }) as mongoose.mongo.Document);
      if (batch.length === 1000) { await collection.insertMany(batch, { ordered: true }); batch = []; }
    }
    if (batch.length) await collection.insertMany(batch, { ordered: true });
    for (const index of item.indexes as Array<Record<string, any>>) {
      const { key, v: _v, ns: _ns, ...options } = index;
      await collection.createIndex(key, options);
    }
    result[item.name] = { expected: item.documents, restored: await collection.countDocuments() };
  }
  const mismatched = Object.entries(result).filter(([, counts]) => counts.expected !== counts.restored);
  return { source: `${manifest.host}/${manifest.database}`, backupCreatedAt: manifest.createdAt,
    consistentSnapshot: manifest.consistentSnapshot, collections: result, ok: mismatched.length === 0 };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({ args: rest, options: { from: { type: "string" }, "target-db": { type: "string" }, out: { type: "string" } } });
  await connectDatabase();
  try {
    const source = mongoose.connection.db!;
    if (command === "backup") {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputDir = resolve(values.out || join(repositoryRoot, "artifacts", "backups", `${source.databaseName}-${stamp}`));
      const manifest = await backupDatabase(source, outputDir);
      console.log(JSON.stringify({ mode: "backup (read-only)", source: `${manifest.host}/${manifest.database}`, outputDir,
        consistentSnapshot: manifest.consistentSnapshot,
        collections: Object.fromEntries(manifest.collections.map(item => [item.name, item.documents])) }, null, 2));
    } else if (command === "restore-test") {
      const targetName = values["target-db"]?.trim();
      if (!values.from || !targetName) throw new Error("Usage: restore-test --from <backup dir> --target-db <new empty database>");
      if (!/^[A-Za-z0-9_-]{1,38}$/.test(targetName)) throw new Error("--target-db must be a plain database name.");
      // Compare with the database actually connected, not only the configured name.
      if ([source.databaseName, config.MONGODB_DB].includes(targetName)) throw new Error("--target-db must differ from the connected (source) database.");
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
