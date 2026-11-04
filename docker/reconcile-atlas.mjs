import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { createHash, randomBytes, createCipheriv } from "node:crypto";
import { MongoClient, BSON } from "mongodb";
import { v2 as cloudinary } from "cloudinary";
import { extname } from "node:path";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const env = dotenv.parse(readFileSync(resolve(root, ".env.docker")));
const dockerPath = resolve(process.env.LOCALAPPDATA || "", "Programs/DockerDesktop/resources/bin/docker.exe");
const docker = existsSync(dockerPath) ? dockerPath : "docker";
const collections = ["organizations", "users", "servicedefinitions", "caserecords", "attachments", "knowledgearticles", "incidents", "auditlogs", "notifications"];
const extract = `const {MongoClient,BSON}=require('mongodb');(async()=>{if(process.env.MONGODB_URI.startsWith('mongodb+srv://'))throw new Error('Source already uses Atlas');const c=new MongoClient(process.env.MONGODB_URI);try{await c.connect();const db=c.db(process.env.MONGODB_DB);const data={};for(const name of ${JSON.stringify(collections)})data[name]=await db.collection(name).find({}).toArray();process.stdout.write(BSON.EJSON.stringify(data,{relaxed:false}));}finally{await c.close()}})().catch(()=>process.exit(1));`;
const sourceProcess = spawnSync(docker, ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "-e", extract], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (sourceProcess.status !== 0) throw new Error("Cannot read the existing API database; source must remain available.");
const source = BSON.EJSON.parse(sourceProcess.stdout, { relaxed: true });
const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db(env.MONGODB_DB || "caseflow_ai");
  const target = {};
  for (const name of collections) target[name] = await db.collection(name).find({}).toArray();
  const report = {};
  for (const name of collections) {
    const sourceIds = new Set(source[name].map(row => String(row._id)));
    report[name] = { source: source[name].length, target: target[name].length, sameIds: target[name].filter(row => sourceIds.has(String(row._id))).length };
  }
  report.caseCodesShared = source.caserecords.filter(row => target.caserecords.some(other => other.code === row.code)).length;
  report.usersSharedByEmail = source.users.filter(row => target.users.some(other => other.email.toLowerCase() === row.email.toLowerCase())).length;
  const out = resolve(root, "artifacts/atlas-migration");
  mkdirSync(out, { recursive: true });
  if (!env.EMAIL_ENCRYPTION_KEY || !/^[a-f\d]{64}$/i.test(env.EMAIL_ENCRYPTION_KEY)) throw new Error("A 32-byte email encryption key is required for private migration snapshots.");
  const key = createHash("sha256").update("caseflow-atlas-migration").update(Buffer.from(env.EMAIL_ENCRYPTION_KEY, "hex")).digest();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  function snapshot(name, data) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(BSON.EJSON.stringify(data, { relaxed: false })), cipher.final()]);
    writeFileSync(resolve(out, `${stamp}-${name}.enc`), Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { flag: "wx", mode: 0o600 });
  }
  snapshot("docker-source", source); snapshot("atlas-before", target);
  writeFileSync(resolve(out, "inventory.json"), JSON.stringify({ createdAt: new Date().toISOString(), report }, null, 2));
  console.log(JSON.stringify({ snapshotEncrypted: true, report }, null, 2));
  if (process.argv.includes("--apply")) {
    const mapping = new Map();
    const stats = { inserted: {}, retained: {}, renamedCaseCodes: 0, migratedFiles: 0, verifiedFiles: 0 };
    for (const row of source.organizations) {
      const match = target.organizations.find(item => item.slug === row.slug);
      mapping.set(String(row._id), match?._id || row._id);
    }
    for (const row of source.users) {
      const orgId = mapping.get(String(row.organizationId));
      const match = target.users.find(item => String(item.organizationId) === String(orgId) && item.email.toLowerCase() === row.email.toLowerCase());
      mapping.set(String(row._id), match?._id || row._id);
    }
    for (const row of source.servicedefinitions) {
      const orgId = mapping.get(String(row.organizationId));
      const match = target.servicedefinitions.find(item => String(item.organizationId) === String(orgId) && item.key === row.key);
      mapping.set(String(row._id), match?._id || row._id);
    }
    for (const name of collections) for (const row of source[name]) if (!mapping.has(String(row._id))) mapping.set(String(row._id), row._id);
    function rewrite(value) {
      if (value instanceof BSON.ObjectId) return mapping.get(String(value)) || value;
      if (typeof value === "string" && mapping.has(value)) return String(mapping.get(value));
      if (value instanceof Date || Buffer.isBuffer(value)) return value;
      if (value?._bsontype) return value;
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, rewrite(item)]));
      return value;
    }
    const privateOptions = { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, resource_type: "raw", type: "authenticated", secure: true };
    async function privateBytes(key) {
      const url = cloudinary.utils.private_download_url(key, "", { ...privateOptions, expires_at: Math.floor(Date.now() / 1000) + 60 });
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Cannot verify private Cloudinary object");
      return Buffer.from(await response.arrayBuffer());
    }
    const migratedAttachments = new Map();
    for (const original of source.attachments.filter(row => !row.deletedAt)) {
      if (original.storageProvider !== "s3") throw new Error("Unexpected legacy attachment provider; manual review required");
      if (!original.objectKey?.startsWith(`${original.organizationId}/${original.caseId}/`)) throw new Error("Unexpected legacy object key");
      const code = `import {getObjectStream} from './apps/api/dist/services/objectStorage.js'; const stream=await getObjectStream(${JSON.stringify(original.objectKey)},'s3');const chunks=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));process.stdout.write(Buffer.concat(chunks).toString('base64'));`;
      const result = spawnSync(docker, ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "--input-type=module", "-e", code], { cwd: root, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 });
      if (result.status !== 0) throw new Error("Legacy file read failed; no metadata was switched");
      const bytes = Buffer.from(result.stdout, "base64");
      if (bytes.length !== original.size) throw new Error("Legacy file size mismatch");
      const transformed = rewrite(original);
      const key = `${transformed.organizationId}/${transformed.caseId}/migrated-${original._id}${extname(original.originalName)}`;
      const existing = await privateBytes(key);
      if (!existing) await new Promise((done, fail) => {
        const upload = cloudinary.uploader.upload_stream({ ...privateOptions, public_id: key, overwrite: false, unique_filename: false, timeout: 60000 }, (error, value) => error || value?.public_id !== key ? fail(new Error("Private Cloudinary migration failed")) : done());
        upload.on("error", fail); upload.end(bytes);
      });
      const downloaded = await privateBytes(key);
      if (!downloaded?.equals(bytes)) throw new Error("Cloudinary byte verification failed");
      transformed.storageProvider = "cloudinary"; transformed.objectKey = key;
      delete transformed.storagePath;
      migratedAttachments.set(String(original._id), transformed);
      stats.migratedFiles++; stats.verifiedFiles++;
    }
    const usedCodes = new Map(target.caserecords.map(row => [row.code, String(row._id)]));
    for (const name of collections) {
      stats.inserted[name] = 0; stats.retained[name] = 0;
      for (const original of source[name]) {
        const row = migratedAttachments.get(String(original._id)) || rewrite(original);
        if (await db.collection(name).findOne({ _id: row._id }, { projection: { _id: 1 } })) { stats.retained[name]++; continue; }
        if (name === "incidents" && target.incidents.some(item => item.code === row.code)) row.code = `${row.code}-MIG-${String(original._id).slice(-8)}`;
        if (name === "caserecords") {
          if (usedCodes.has(row.code) && usedCodes.get(row.code) !== String(row._id)) {
            row.code = `${row.code}-MIG-${String(original._id).slice(-8)}`;
            stats.renamedCaseCodes++;
          }
          if (usedCodes.has(row.code)) throw new Error("Unresolved duplicate case code");
          usedCodes.set(row.code, String(row._id));
          row.deliveryEvents = [];
          delete row.searchTokens; delete row.searchVersion;
          if (row.ai?.processingStatus === "running") row.ai.processingStatus = "queued";
        }
        if (name === "users") { row.tokenVersion = (row.tokenVersion || 0) + 1; delete row.mfaPendingSecret; delete row.mfaPendingUntil; }
        await db.collection(name).insertOne(row);
        stats.inserted[name]++;
      }
    }
    for (const original of source.caserecords) {
      const id = mapping.get(String(original._id));
      const rows = await db.collection("attachments").find({ caseId: id, deletedAt: null }).toArray();
      await db.collection("caserecords").updateOne({ _id: id }, { $set: { attachmentCount: rows.length, attachmentBytes: rows.reduce((sum, row) => sum + row.size, 0) } });
    }
    const finalCounts = {};
    const allowedRoots = [resolve(root, "uploads"), resolve(root, "apps/api/uploads")].filter(path => existsSync(path)).map(path => realpathSync(path));
    stats.migratedLocalFiles = 0;
    for (const attachment of target.attachments.filter(item => !item.deletedAt && (!item.storageProvider || item.storageProvider === "local"))) {
      if (!attachment.storagePath || !existsSync(attachment.storagePath)) throw new Error("Original Atlas attachment missing; local metadata retained");
      const path = realpathSync(attachment.storagePath);
      if (!allowedRoots.some(directory => { const sub = relative(directory, path); return sub && !sub.startsWith("..") && !isAbsolute(sub); })) throw new Error("Local attachment lies outside the approved upload directories");
      const bytes = readFileSync(path);
      if (bytes.length !== attachment.size) throw new Error("Local original length mismatch");
      const key = `${attachment.organizationId}/${attachment.caseId}/migrated-${attachment._id}${extname(attachment.originalName)}`;
      const existing = await privateBytes(key);
      if (!existing) await new Promise((done, fail) => { const upload = cloudinary.uploader.upload_stream({ ...privateOptions, public_id: key, overwrite: false, unique_filename: false, timeout: 60000 }, (error, value) => error || value?.public_id !== key ? fail(new Error("Local private migration failed")) : done()); upload.on("error", fail); upload.end(bytes); });
      if (!(await privateBytes(key))?.equals(bytes)) throw new Error("Local migration byte verification failed");
      const changed = await db.collection("attachments").updateOne({ _id: attachment._id, storagePath: attachment.storagePath }, { $set: { storageProvider: "cloudinary", objectKey: key }, $unset: { storagePath: "" } });
      if (!changed.modifiedCount) throw new Error("Local metadata changed concurrently");
      stats.migratedLocalFiles++; stats.verifiedFiles++;
    }
    stats.sourceCasesVerified = await db.collection("caserecords").countDocuments({ _id: { $in: source.caserecords.map(row => row._id) } });
    stats.renamedCaseCodes = await db.collection("caserecords").countDocuments({ _id: { $in: source.caserecords.map(row => row._id) }, code: { $regex: "-MIG-" } });
    for (const name of collections) finalCounts[name] = await db.collection(name).countDocuments();
    writeFileSync(resolve(out, "migration-result.json"), JSON.stringify({ completedAt: new Date().toISOString(), stats, finalCounts, note: "Existing Atlas accounts/configuration retained. Source objects and database not deleted. Sessions/reset tokens not migrated." }, null, 2));
    console.log(JSON.stringify({ applied: true, stats, finalCounts }, null, 2));
  }
} finally { await client.close(); }
