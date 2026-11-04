import { setTimeout as delay } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export default async function teardown() {
  const token = process.env.CASEFLOW_E2E_CONTROL_TOKEN;
  if (!/^[a-f0-9-]{36}$/i.test(token || "")) throw new Error("E2E control token missing or invalid.");
  const response = await fetch("http://127.0.0.1:5188/__e2e/shutdown", {
    method: "POST", headers: { "x-e2e-control": token }, signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`E2E shutdown rejected (${response.status}).`);
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    try { if (await readFile(resolve("artifacts/e2e-control", `${token}.complete`), "utf8") === "complete") return; }
    catch { /* Cleanup has not acknowledged completion yet. */ }
    await delay(100);
  }
  throw new Error("E2E server did not finish resource cleanup.");
}
