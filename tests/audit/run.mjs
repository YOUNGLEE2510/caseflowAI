import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "artifacts/product-audit");
await mkdir(output, { recursive: true });
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this suite using npm run test:audit");
const steps = [
  { name: "baseline", command: process.execPath, args: [npmCli, "test"] },
  { name: "baseline-e2e", command: process.execPath, args: [resolve(root, "node_modules/@playwright/test/cli.js"), "test"] },
  { name: "api-contracts", command: process.execPath, args: [npmCli, "run", "test:audit", "--workspace=@caseflow/api"] },
  { name: "ai-contracts", command: "python", args: ["-m", "pytest", "apps/ai/audits", "-q", "--junitxml=artifacts/product-audit/ai.xml"] },
  { name: "browser-contracts", command: process.execPath, args: [resolve(root, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.audit.config.ts"] },
];
const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
const reportOnly = process.argv.includes("--report-only");
if (only && !steps.some(step => step.name === only)) throw new Error(`Unknown audit suite: ${only}`);
let results = [];
if (only || reportOnly) {
  try { results = JSON.parse(await readFile(resolve(output, "summary.json"), "utf8")).results || []; }
  catch { /* First selective run has no prior results. */ }
}
for (const step of steps.filter(step => !reportOnly && (!only || step.name === only))) {
  console.log(`\n=== ${step.name} ===`);
  const report = { "api-contracts": "api.json", "ai-contracts": "ai.xml", "browser-contracts": "browser.json" }[step.name];
  if (report) await rm(resolve(output, report), { force: true });
  const started = Date.now();
  let log = "";
  const exitCode = await new Promise(done => {
    const child = spawn(step.command, step.args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", data => { log += data; process.stdout.write(data); });
    child.stderr.on("data", data => { log += data; process.stderr.write(data); });
    child.once("error", error => { log += error.message; done(1); });
    child.once("close", code => done(code ?? 1));
  });
  await writeFile(resolve(output, `${step.name}.log`), log, "utf8");
  results = results.filter(result => result.name !== step.name);
  results.push({ name: step.name, exitCode, durationMs: Date.now() - started, finishedAt: new Date().toISOString() });
}
let failures = [];
try {
  const api = JSON.parse(await readFile(resolve(output, "api.json"), "utf8"));
  failures = api.testResults.flatMap(file => file.assertionResults.filter(test => test.status === "failed").map(test => ({ suite: "api", name: test.fullName, file: file.name })));
} catch { /* Missing reports remain visible as failed steps. */ }
try {
  const { stdout } = await promisify(execFile)("python", [resolve(root, "tests/audit/read_junit.py"), resolve(output, "ai.xml")]);
  failures.push(...JSON.parse(stdout));
} catch { /* Missing JUnit output remains visible as a failed AI step. */ }
try {
  const browser = JSON.parse(await readFile(resolve(output, "browser.json"), "utf8"));
  function visit(suite) {
    return [...(suite.specs || []).flatMap(spec => spec.tests.some(test => test.status !== "expected") ? [{ suite: "browser", name: spec.title, file: spec.file }] : []), ...(suite.suites || []).flatMap(visit)];
  }
  failures.push(...browser.suites.flatMap(visit));
} catch { /* Raw logs and process status are retained. */ }
let dockerReport = null;
try {
  dockerReport = JSON.parse(await readFile(resolve(output, "docker.log"), "utf8"));
  failures.push(...dockerReport.results.filter(result => !result.passed).map(result => ({ suite: "docker", name: result.name, file: "tests/audit/docker-checks.mjs" })));
} catch { /* Docker checks are opt-in and may not have been run. */ }
await writeFile(resolve(output, "summary.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results, failures, dockerReport, aiReport: "ai.xml", warning: "A passing test is not proof that every product requirement has been verified. Diagnostic contracts intentionally remain red while defects exist." }, null, 2));
const lines = ["# Product Audit Results", "", `Generated: ${new Date().toISOString()}`, "", "## Execution", "", "| Suite | Exit Code | Duration (s) |", "|---|---:|---:|", ...results.map(result => `| ${result.name} | ${result.exitCode} | ${(result.durationMs / 1000).toFixed(1)} |`), "", "## Failing Contracts", "", ...failures.map(failure => `- **${failure.suite}**: ${failure.name} (${failure.file})`), "", "Read raw logs and JSON/XML reports before classifying a failed contract as a product defect. Setup/environment errors are not product defects. This run is not a complete security, load, accessibility, OAuth or model-quality certification."];
if (dockerReport) lines.push("", "## Optional Docker Results", "", `Last optional run: ${dockerReport.generatedAt}. This group is not rerun by the normal audit command.`, ...dockerReport.results.map(result => `- ${result.passed ? "PASS" : "FAIL"}: ${result.name}`));
await writeFile(resolve(output, "ISSUES.md"), lines.join("\n"), "utf8");
console.log(`\nAudit reports: ${output}`);
process.exitCode = results.some(result => result.exitCode !== 0) || failures.length ? 1 : 0;
