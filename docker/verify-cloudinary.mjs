import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import dotenv from "dotenv";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const desktop = resolve(process.env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe");
const docker = process.env.DOCKER_BIN || (process.platform === "win32" && existsSync(desktop) ? desktop : "docker");
const script = `
import { randomUUID, createHash } from 'node:crypto';
import { config } from './apps/api/dist/config.js';
import { storeCloudinaryObject, getCloudinaryObjectStream, deleteCloudinaryObject } from './apps/api/dist/services/cloudinaryStorage.js';
const key = '_diagnostics/cloudinary/' + randomUUID() + '.txt';
const original = Buffer.from('CaseFlow synthetic private storage verification ' + randomUUID());
let stored = false;
try {
  await storeCloudinaryObject(key, original); stored = true;
  const stream = await getCloudinaryObjectStream(key);
  const parts = []; for await (const chunk of stream) parts.push(Buffer.from(chunk));
  const restored = Buffer.concat(parts);
  if (!original.equals(restored)) throw new Error('Byte comparison failed');
  const unsigned = 'https://res.cloudinary.com/' + config.CLOUDINARY_CLOUD_NAME + '/raw/authenticated/' + key;
  const response = await fetch(unsigned, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (![401, 403, 404].includes(response.status)) throw new Error('Anonymous access was not denied');
  console.log(JSON.stringify({ status: 'passed', syntheticBytes: original.length, anonymousStatus: response.status,
    sha256: createHash('sha256').update(restored).digest('hex'), userFilesModified: false }));
} finally { if (stored) await deleteCloudinaryObject(key); }
`;
const local = process.argv.includes("--local");
const environment = local ? dotenv.parse(readFileSync(resolve(root, ".env.docker"))) : {};
const localEnvironment = { ...process.env, NODE_ENV: "test",
  ...Object.fromEntries(["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].map(key => [key, environment[key] || ""])) };
const result = spawnSync(local ? process.execPath : docker,
  local ? ["--input-type=module"] : ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "--input-type=module"],
  { cwd: root, input: script, encoding: "utf8", maxBuffer: 1024 * 1024, ...(local ? { env: localEnvironment } : {}) });
if (result.status !== 0) {
  console.error("Cloudinary verification failed. Check server credentials, private raw delivery and container configuration; no secrets printed.");
  process.exitCode = 1;
} else process.stdout.write(result.stdout);
