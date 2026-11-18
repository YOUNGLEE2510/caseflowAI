// Offline evaluation of the explainable priority rules against labelled scenarios.
// Usage: npm run evaluate:priority --workspace=@caseflow/api [-- --dataset path.json --output dir]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestPriority, type Priority } from "../services/prioritySuggestion.js";

const LEVELS: Priority[] = ["low", "normal", "high", "urgent"];
interface Scenario { text: string; category?: string; relatedOpenCases?: number; expected: Priority }

export function evaluatePriority(scenarios: Scenario[]) {
  const confusion = LEVELS.map(() => LEVELS.map(() => 0));
  const rows = scenarios.map(scenario => {
    const predicted = suggestPriority(scenario).priority;
    confusion[LEVELS.indexOf(scenario.expected)][LEVELS.indexOf(predicted)] += 1;
    return { text: scenario.text, expected: scenario.expected, predicted, correct: predicted === scenario.expected };
  });
  const perLevel = Object.fromEntries(LEVELS.map((level, index) => {
    const truePositive = confusion[index][index];
    const support = confusion[index].reduce((sum, value) => sum + value, 0);
    const predictedCount = confusion.reduce((sum, row) => sum + row[index], 0);
    const precision = predictedCount ? truePositive / predictedCount : 0;
    const recall = support ? truePositive / support : 0;
    return [level, { precision: round(precision), recall: round(recall), f1: round(precision + recall ? 2 * precision * recall / (precision + recall) : 0), support }];
  }));
  const urgent = rows.filter(row => row.expected === "urgent");
  // Under-triage of real emergencies is the costly error; over-triage only costs staff time.
  return {
    metrics: {
      scenarios: rows.length,
      accuracy: round(rows.filter(row => row.correct).length / rows.length),
      macroF1: round(LEVELS.reduce((sum, level) => sum + perLevel[level].f1, 0) / LEVELS.length),
      urgentRecall: round(urgent.filter(row => row.predicted === "urgent").length / Math.max(1, urgent.length)),
      underTriage: round(rows.filter(row => LEVELS.indexOf(row.predicted) < LEVELS.indexOf(row.expected)).length / rows.length),
      overTriage: round(rows.filter(row => LEVELS.indexOf(row.predicted) > LEVELS.indexOf(row.expected)).length / rows.length)
    },
    perLevel, labels: LEVELS, confusionMatrix: confusion,
    errors: rows.filter(row => !row.correct)
  };
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
  const dataset = resolve(argument("--dataset") || fileURLToPath(new URL("./priority_scenarios.json", import.meta.url)));
  const output = resolve(argument("--output") || fileURLToPath(new URL("../../../../artifacts/ai-evaluation", import.meta.url)));
  const { scenarios } = JSON.parse(await readFile(dataset, "utf8")) as { scenarios: Scenario[] };
  const report = { metadata: { generatedAt: new Date().toISOString(), dataset, method: "rule-based suggestPriority",
    warning: "Scenarios are simulated and labelled by the authors; results describe rule coverage, not production accuracy." }, ...evaluatePriority(scenarios) };
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "priority.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log(`Report written to ${resolve(output, "priority.json")} (${dirname(dataset)})`);
}
