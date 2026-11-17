import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const require = createRequire(new URL("apps/api/package.json", root));
let profile = process.env.DOMAIN_PROFILE;
if (!profile) {
  try { profile = require("dotenv").parse(readFileSync(new URL("apps/api/.env", root))).DOMAIN_PROFILE; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
profile ||= "rental";
if (!["rental", "education"].includes(profile)) throw new Error("Invalid DOMAIN_PROFILE");
const child = spawn(process.env.PYTHON || "python", ["-m", "uvicorn", "apps.ai.app:app", ...(process.argv.includes("--watch") ? ["--reload"] : []), "--host", "127.0.0.1", "--port", "8001"], {
  cwd: fileURLToPath(root), stdio: "inherit", env: { ...process.env, DOMAIN_PROFILE: profile }
});
child.once("error", error => { console.error(error.message); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
