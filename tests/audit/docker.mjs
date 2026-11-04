import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const candidates = process.platform === "win32" ? [join(process.env.LOCALAPPDATA || "", "Programs/DockerDesktop/resources/bin/docker.exe"), join(process.env.ProgramFiles || "C:/Program Files", "Docker/Docker/resources/bin/docker.exe")] : [];
const docker = candidates.find(existsSync) || "docker";
const source = await readFile(resolve(root, "tests/audit/docker-checks.mjs"), "utf8");
const child = spawn(docker, ["compose", "--env-file", ".env.docker", "exec", "-T", "api", "node", "--input-type=module"], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", data => { output += data; process.stdout.write(data); });
child.stderr.on("data", data => process.stderr.write(data));
child.stdin.on("error", () => undefined);
child.stdin.end(source);
const code = await new Promise(done => {
  child.once("error", error => { console.error(error.message); done(1); });
  child.once("close", code => done(code ?? 1));
});
await mkdir(resolve(root, "artifacts/product-audit"), { recursive: true });
await writeFile(resolve(root, "artifacts/product-audit/docker.log"), output);
process.exitCode = code;
