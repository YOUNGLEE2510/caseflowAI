import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktopDocker = resolve(process.env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
const docker = process.env.DOCKER_BIN || (process.platform === "win32" && existsSync(desktopDocker) ? desktopDocker : "docker");
const id = randomUUID();
const key = `_diagnostics/restore-test/${id}.txt`;
const body = Buffer.from(`CaseFlow synthetic object recovery test ${id}\n`);
const expectedHash = createHash("sha256").update(body).digest("hex");
const folder = resolve(root, "artifacts", "object-storage-verification", id);
mkdirSync(folder, { recursive: true });
const backup = resolve(folder, "synthetic-backup.txt");
function execute(code) {
  const result = spawnSync(docker, ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "--input-type=module"], {
    cwd: root, input: code, encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 120000
  });
  if (result.status !== 0) throw new Error(`Object storage verification failed: ${result.stderr?.slice(-1200) || result.error?.message}`);
  return JSON.parse(result.stdout.trim());
}
const setup = `
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
const client = new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'us-east-1',forcePathStyle:true,
  credentials:{accessKeyId:process.env.S3_ACCESS_KEY,secretAccessKey:process.env.S3_SECRET_KEY},requestHandler:{connectionTimeout:5000,requestTimeout:30000}});
const Bucket=process.env.S3_BUCKET, Key=${JSON.stringify(key)};
if(!Key.startsWith('_diagnostics/restore-test/')) throw new Error('Unsafe probe key');
const hash = data => createHash('sha256').update(data).digest('hex');
`;
let created = false;
try {
  created = true;
  const original = execute(setup + `
await client.send(new PutObjectCommand({Bucket,Key,Body:Buffer.from(${JSON.stringify(body.toString("base64"))},'base64'),ContentType:'text/plain'}));
const result=await client.send(new GetObjectCommand({Bucket,Key}));
const bytes=Buffer.from(await result.Body.transformToByteArray());
const url=new URL(process.env.S3_ENDPOINT); url.pathname='/'+Bucket+'/'+Key;
const anonymous=await fetch(url,{signal:AbortSignal.timeout(10000)});
console.log(JSON.stringify({body:bytes.toString('base64'),sha256:hash(bytes),anonymousStatus:anonymous.status}));
`);
  if (original.sha256 !== expectedHash) throw new Error("Initial object checksum mismatch");
  if (![401, 403].includes(original.anonymousStatus)) throw new Error("Anonymous access did not return an explicit authorization denial");
  writeFileSync(backup, Buffer.from(original.body, "base64"));
  const recovered = execute(setup + `
await client.send(new DeleteObjectCommand({Bucket,Key}));
let missing=false;
try { await client.send(new HeadObjectCommand({Bucket,Key})); } catch(error) { if(error.$metadata?.httpStatusCode===404) missing=true; else throw error; }
if(!missing) throw new Error('Probe deletion was not confirmed');
await client.send(new PutObjectCommand({Bucket,Key,Body:Buffer.from(${JSON.stringify(readFileSync(backup).toString("base64"))},'base64'),ContentType:'text/plain'}));
const response=await client.send(new GetObjectCommand({Bucket,Key}));
const bytes=Buffer.from(await response.Body.transformToByteArray());
console.log(JSON.stringify({deletedBeforeRestore:missing,sha256:hash(bytes),bytes:bytes.length}));
`);
  if (recovered.sha256 !== expectedHash) throw new Error("Restored object checksum mismatch");
  const attachments = execute(setup + `
import mongoose from 'mongoose';
import { config } from '/app/apps/api/dist/config.js';
import { Attachment } from '/app/apps/api/dist/models/attachment.js';
await mongoose.connect(config.MONGODB_URI,{dbName:config.MONGODB_DB});
const rows=await Attachment.find({deletedAt:null,deleting:{$ne:true},storageProvider:'s3'}).select('objectKey size').lean();
let verified=0; const failures=[];
for(const row of rows) {
  try {
    if(!row.objectKey) throw new Error('missing_key');
    const object=await client.send(new GetObjectCommand({Bucket,Key:row.objectKey}));
    let size=0; for await (const chunk of object.Body) size+=chunk.length;
    if(size!==row.size) throw new Error('size_mismatch');
    verified++;
  } catch { failures.push(String(row._id)); }
}
await mongoose.disconnect();
console.log(JSON.stringify({checked:rows.length,verified,failedAttachmentIds:failures}));
`);
  const report = { checkedAt: new Date().toISOString(), status: attachments.failedAttachmentIds.length ? "attachment_failures" : "passed",
    scope: "S3 object-level recovery, not whole-volume disaster recovery", syntheticBytes: recovered.bytes,
    sha256: expectedHash, deletedBeforeRestore: recovered.deletedBeforeRestore, anonymousStatus: original.anonymousStatus,
    attachments, userObjectsModified: false };
  writeFileSync(resolve(folder, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (attachments.failedAttachmentIds.length) process.exitCode = 1;
} finally {
  if (created) execute(setup + `await client.send(new DeleteObjectCommand({Bucket,Key})); console.log(JSON.stringify({probeRemoved:true}));`);
}
