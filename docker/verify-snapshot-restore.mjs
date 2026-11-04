import { createHash, createDecipheriv, createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, BSON } from "mongodb";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "artifacts/atlas-migration");
const env = dotenv.parse(readFileSync(resolve(root, process.env.CASEFLOW_ENV_FILE || ".env.docker")));
if (!/^[a-f\d]{64}$/i.test(env.EMAIL_ENCRYPTION_KEY || "")) throw new Error("Snapshot encryption key is required.");
const key = createHash("sha256").update("caseflow-atlas-migration").update(Buffer.from(env.EMAIL_ENCRYPTION_KEY, "hex")).digest();
mkdirSync(directory, { recursive: true });
const live = process.argv.includes("--live");
const files = readdirSync(directory).filter(name => /-(atlas-before|docker-source)\.enc$/.test(name)).sort();
const selected = live ? [] : ["atlas-before", "docker-source"].map(kind => files.filter(name => name.endsWith(`-${kind}.enc`)).at(-1)).filter(Boolean);
if (!live && selected.length !== 2) throw new Error("Both migration snapshots are required, or use --live for a read-only current snapshot.");
if (live) {
  const source = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await source.connect();
    const data = {};
    const db = source.db(env.MONGODB_DB || "caseflow_ai");
    for (const collection of ["organizations", "users", "servicedefinitions", "caserecords", "attachments", "knowledgearticles", "incidents", "auditlogs", "notifications"]) {
      data[collection] = await db.collection(collection).find({}).toArray();
    }
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([cipher.update(BSON.EJSON.stringify(data, { relaxed: false })), cipher.final()]);
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-current-atlas.enc`;
    writeFileSync(resolve(directory, name), Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]), { flag: "wx", mode: 0o600 });
    selected.push(name);
  } finally { await source.close(); }
}
const database = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
const client = new MongoClient(database.getUri());
try {
  await client.connect();
  for (const [index, name] of selected.entries()) {
    const bytes = readFileSync(resolve(directory, name));
    if (bytes.length < 29) throw new Error("Invalid encrypted snapshot.");
    const decode = input => {
      const decipher = createDecipheriv("aes-256-gcm", key, input.subarray(0, 12));
      decipher.setAuthTag(input.subarray(12, 28));
      return BSON.EJSON.parse(Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]).toString("utf8"), { relaxed: true });
    };
    const data = decode(bytes);
    const damaged = Buffer.from(bytes); damaged[damaged.length - 1] ^= 1;
    let rejected = false;
    try { decode(damaged); } catch { rejected = true; }
    if (!rejected) throw new Error("Corrupted snapshot was accepted.");
    const db = client.db(`snapshot_verification_${index}`);
    let rows = 0;
    for (const [collection, documents] of Object.entries(data)) {
      if (!Array.isArray(documents) || !/^[a-z][a-z0-9_]*$/i.test(collection)) throw new Error("Invalid snapshot collection.");
      if (documents.length) await db.collection(collection).insertMany(documents);
      if (await db.collection(collection).countDocuments() !== documents.length) throw new Error("Restored count mismatch.");
      const restored = await db.collection(collection).find({}).toArray();
      const canonical = values => values.map(value => BSON.EJSON.stringify(value, { relaxed: false })).sort();
      if (JSON.stringify(canonical(restored)) !== JSON.stringify(canonical(documents))) throw new Error("Restored content mismatch.");
      rows += documents.length;
    }
    console.log(JSON.stringify({ snapshot: name, restoredCollections: Object.keys(data).length, restoredDocuments: rows, contentsVerified: true, corruptedSnapshotRejected: true, isolatedDatabase: true }));
  }
} finally {
  await client.close();
  await database.stop();
}
