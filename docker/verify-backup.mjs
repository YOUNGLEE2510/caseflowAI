import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktopDocker = resolve(process.env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
const docker = process.env.DOCKER_BIN || (process.platform === "win32" && existsSync(desktopDocker) ? desktopDocker : "docker");
const compose = ["compose", "--env-file", ".env.docker", "--profile", "backup"];
const databaseName = dotenv.parse(readFileSync(resolve(root, ".env.docker"))).MONGODB_DB || "caseflow_ai";
if (!/^[a-zA-Z0-9_-]+$/.test(databaseName)) throw new Error("Unsupported database name for restore verification");
const runId = randomUUID();
const target = `caseflow-restore-test-${runId}`;
function run(args, input) {
  const result = spawnSync(docker, args, { cwd: root, encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Backup verification command failed (${args[0]}): ${result.stderr?.slice(-1500) || result.error?.message || "unknown"}`);
  return result.stdout.trim();
}
const inventory = `
const crypto = require('crypto');
const targetDb = db.getSiblingDB(${JSON.stringify(databaseName)});
const result = {};
for (const name of targetDb.getCollectionNames().filter(n => !n.startsWith('system.')).sort()) {
  const collection = targetDb.getCollection(name), digest = crypto.createHash('sha256');
  let count = 0;
  const cursor = collection.find().sort({_id:1});
  while (cursor.hasNext()) { const document = cursor.next(); digest.update(EJSON.stringify(document, {relaxed:false})); digest.update('\\n'); count++; }
  const indexes = collection.getIndexes().map(({v,ns,background,...index}) => index).sort((a,b)=>a.name.localeCompare(b.name));
  result[name] = {count, sha256:digest.digest('hex'), indexes};
}
print(JSON.stringify(result));`;
function sourceInventory() {
  return JSON.parse(run([...compose, "exec", "-T", "mongo", "mongosh", "--quiet", "--file", "/dev/stdin"],
    `if(!db.getSiblingDB('admin').auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) throw new Error('Source authentication failed');\n${inventory}`));
}
let created = false;
try {
  const before = sourceInventory();
  const output = run([...compose, "run", "--rm", "--no-deps", "mongo-backup", "--once"]);
  const stamp = output.match(/MongoDB backup completed: (\d{8}T\d{6}Z)/)?.[1];
  if (!stamp) throw new Error("Backup job did not confirm a completed archive");
  const after = sourceInventory();
  const backupId = run([...compose, "ps", "-q", "mongo-backup"]);
  if (!backupId) throw new Error("Scheduled backup service must be running");
  const mounts = JSON.parse(run(["inspect", backupId]))[0].Mounts;
  const volume = mounts.find(mount => mount.Destination === "/backups" && mount.Type === "volume")?.Name;
  if (!volume || !/^[a-zA-Z0-9_.-]+$/.test(volume)) throw new Error("Unexpected backup volume");
  run(["run", "-d", "--name", target, "--label", `caseflow.restore-test=${runId}`, "--network", "none", "--mount", `type=volume,src=${volume},dst=/backups,readonly`, "mongo:7", "mongod", "--bind_ip", "127.0.0.1", "--setParameter", "ttlMonitorEnabled=false"]);
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = spawnSync(docker, ["exec", target, "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"], { encoding: "utf8" });
    if (probe.status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Isolated restore database did not become ready");
  const archive = `/backups/${stamp}.archive.gz`;
  run(["exec", target, "sha256sum", "-c", `${archive}.sha256`]);
  const archiveSha256 = run(["exec", target, "sha256sum", archive]).split(/\s/)[0];
  run(["exec", target, "mongorestore", `--archive=${archive}`, "--gzip", "--stopOnError"]);
  const restored = JSON.parse(run(["exec", "-i", target, "mongosh", "--quiet", "--file", "/dev/stdin"], inventory));
  const stable = Object.keys(before).filter(name => JSON.stringify(before[name]) === JSON.stringify(after[name]));
  const changedDuringBackup = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => !stable.includes(name));
  const mismatches = stable.filter(name => JSON.stringify(before[name]) !== JSON.stringify(restored[name]));
  if (!stable.length || mismatches.length) throw new Error(`Restore mismatch in stable collections: ${mismatches.join(', ') || 'none were stable'}`);
  const report = { checkedAt: new Date().toISOString(), status: changedDuringBackup.length ? "passed_for_stable_collections" : "passed", archive, archiveSha256,
    isolatedNetwork: true, sourceModifiedByTest: false, comparedCollections: stable.length,
    restoredDocuments: Object.values(restored).reduce((sum, row) => sum + row.count, 0), changedDuringBackup,
    collections: Object.fromEntries(stable.map(name => [name, { count: restored[name].count, sha256: restored[name].sha256, indexes: restored[name].indexes.length }])) };
  const folder = resolve(root, "artifacts", "backup-verification");
  mkdirSync(folder, { recursive: true });
  writeFileSync(resolve(folder, `${stamp}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (created) {
    const info = JSON.parse(run(["inspect", target]))[0];
    if (info.Config.Labels?.["caseflow.restore-test"] !== runId || info.Name !== `/${target}`) throw new Error("Restore-test cleanup identity mismatch");
    run(["rm", "-f", "-v", target]);
  }
}
