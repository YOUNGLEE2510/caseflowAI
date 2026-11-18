import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluatePriority } from "../src/evaluation/evaluatePriority.js";

const { scenarios } = JSON.parse(readFileSync(new URL("../src/evaluation/priority_scenarios.json", import.meta.url), "utf8"));

describe("priority rule evaluation", () => {
  it("reports per-level metrics and guards against regressions in emergency detection", () => {
    const report = evaluatePriority(scenarios);
    expect(report.metrics.scenarios).toBe(60);
    expect(report.confusionMatrix.flat().reduce((sum: number, value: number) => sum + value, 0)).toBe(60);
    // Baseline measured on 2026-11-18: accuracy 0.83, urgent recall 0.79. Lower values mean a rule regressed.
    expect(report.metrics.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(report.metrics.urgentRecall).toBeGreaterThanOrEqual(0.75);
    expect(report.perLevel.urgent.precision).toBe(1);
  });
});
