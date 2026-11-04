import { MongoClient } from "mongodb";
import { v2 as cloudinary } from "cloudinary";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const env = dotenv.parse(readFileSync(resolve(root, ".env.docker")));
const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect(); const db = client.db(env.MONGODB_DB || "caseflow_ai");
  const [cases, users, orgs, attachments] = await Promise.all(["caserecords", "users", "organizations", "attachments"].map(name => db.collection(name).find({}).toArray()));
  const userIds = new Set(users.map(row => String(row._id))), orgIds = new Set(orgs.map(row => String(row._id))), caseIds = new Set(cases.map(row => String(row._id)));
  if (cases.some(row => !orgIds.has(String(row.organizationId)) || !userIds.has(String(row.requesterId)) || row.assigneeId && !userIds.has(String(row.assigneeId)))) throw new Error("Case reference validation failed");
  const checked = [];
  for (const file of attachments.filter(row => !row.deletedAt)) {
    if (!caseIds.has(String(file.caseId)) || !orgIds.has(String(file.organizationId)) || !userIds.has(String(file.uploaderId))) throw new Error("Attachment reference validation failed");
    if (file.storageProvider !== "cloudinary" || !file.objectKey?.startsWith(`${file.organizationId}/${file.caseId}/`)) throw new Error("Attachment has not been migrated to private cloud storage");
    const url = cloudinary.utils.private_download_url(file.objectKey, "", { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, resource_type: "raw", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 60, secure: true });
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("Private attachment cannot be read");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== file.size) throw new Error("Attachment length mismatch");
    const unsigned = await fetch(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/raw/authenticated/${file.objectKey}`, { redirect: "error", signal: AbortSignal.timeout(30000) });
    if (![401, 403, 404].includes(unsigned.status)) throw new Error("Anonymous attachment access is not denied");
    checked.push({ id: String(file._id), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), anonymousStatus: unsigned.status });
  }
  const result = { verifiedAt: new Date().toISOString(), cases: cases.length, users: users.length, filesVerified: checked.length, referencesValid: true, checked };
  mkdirSync(resolve(root, "artifacts/atlas-migration"), { recursive: true });
  writeFileSync(resolve(root, "artifacts/atlas-migration/verification.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ verified: true, cases: result.cases, users: result.users, filesVerified: result.filesVerified, referencesValid: true }));
} finally { await client.close(); }
