import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const file = resolve(root, ".env.docker");
const env = dotenv.parse(readFileSync(file));
for (const [key, fallback] of Object.entries({ MONGO_APP_USER: "caseflow", MONGO_APP_PASSWORD: randomBytes(32).toString("hex"), MONGO_ROOT_USER: "caseflow_admin", MONGO_ROOT_PASSWORD: randomBytes(32).toString("hex") })) {
  if (!env[key]) { env[key] = fallback; appendFileSync(file, `\n${key}=${fallback}\n`); }
}
function run(args, input) {
  const result = spawnSync("docker", ["compose", "--env-file", ".env.docker", ...args], { cwd: root, input, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Mongo migration command failed; existing volume has not been deleted.");
  return result.stdout.trim();
}
const probe = `const a=db.getSiblingDB('admin'); if(a.auth(${JSON.stringify(env.MONGO_ROOT_USER)},${JSON.stringify(env.MONGO_ROOT_PASSWORD)})) print('already-secured');`;
try { if (run(["exec", "-T", "mongo", "mongosh", "--quiet"], probe).includes("already-secured")) { console.log("Mongo credentials already provisioned."); process.exit(0); } } catch { /* Existing local database may not have users yet. */ }
const backup = `/tmp/caseflow-before-auth-${Date.now()}.archive.gz`;
const folder = resolve(root, "artifacts", "mongo-backups");
mkdirSync(folder, { recursive: true });
run(["exec", "-T", "mongo", "mongodump", "--archive=" + backup, "--gzip"]);
run(["cp", `mongo:${backup}`, resolve(folder, backup.split("/").at(-1))]);
const script = `const a=db.getSiblingDB('admin');
if(a.getUser(${JSON.stringify(env.MONGO_APP_USER)})) throw new Error('Existing application user needs manual review');
a.createUser({user:${JSON.stringify(env.MONGO_APP_USER)},pwd:${JSON.stringify(env.MONGO_APP_PASSWORD)},roles:[{role:'readWrite',db:'caseflow_ai'}]});
if(!a.getUser(${JSON.stringify(env.MONGO_ROOT_USER)})) a.createUser({user:${JSON.stringify(env.MONGO_ROOT_USER)},pwd:${JSON.stringify(env.MONGO_ROOT_PASSWORD)},roles:['root']});
print('provisioned');`;
run(["exec", "-T", "mongo", "mongosh", "--quiet"], script);
console.log("Mongo backup saved under artifacts/mongo-backups; application and recovery users provisioned. No volume was removed.");
