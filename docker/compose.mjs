import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envFile = join(root, ".env.docker");
const commands = { up: ["up", "--build", "-d"], stop: ["stop"], status: ["ps"], logs: ["logs", "-f", "--tail=100"] };
const args = commands[process.argv[2]];
if (!args) throw new Error("Expected up, stop, status or logs");
if (!existsSync(envFile)) writeFileSync(envFile, `JWT_SECRET=${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
const stored = readFileSync(envFile, "utf8");
for (const [key, value] of Object.entries({
  MONGO_APP_USER: "caseflow", MONGO_APP_PASSWORD: randomBytes(32).toString("hex"),
  MONGO_ROOT_USER: "caseflow_admin", MONGO_ROOT_PASSWORD: randomBytes(32).toString("hex"),
  AI_INTERNAL_TOKEN: randomBytes(32).toString("hex"),
  S3_ACCESS_KEY: `caseflow-${randomBytes(8).toString("hex")}`, S3_SECRET_KEY: randomBytes(32).toString("hex")
})) {
  if (!new RegExp(`^${key}=`, "m").test(stored)) appendFileSync(envFile, `\n${key}=${value}\n`);
}
const candidates = process.platform === "win32" ? [
  join(process.env.LOCALAPPDATA || "", "Programs", "DockerDesktop", "resources", "bin", "docker.exe"),
  join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin", "docker.exe"),
] : [];
const executable = candidates.find(existsSync) || "docker";
const child = spawn(executable, ["compose", "--env-file", ".env.docker", ...args], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PATH: executable === "docker" ? process.env.PATH : `${dirname(executable)}${delimiter}${process.env.PATH || ""}` },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
