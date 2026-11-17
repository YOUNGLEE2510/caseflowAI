import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const files = (await readdir("tests/e2e")).filter(file => file.endsWith(".spec.ts")).sort();
const failures = [];
for (const file of files) {
  console.log(`\nE2E suite: ${file}`);
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", `tests/e2e/${file}`, `--output=artifacts/e2e-batches/${file.slice(0, -8)}`], { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => done(signal ? 1 : code ?? 1));
  });
  if (code !== 0) failures.push(file);
}
console.log(`\nE2E suites: ${files.length - failures.length}/${files.length} passed`);
if (failures.length) console.error(`Failed suites: ${failures.join(", ")}`);
process.exitCode = failures.length ? 1 : 0;
