const operations = ["classify", "similarity", "sla", "retrieval"] as const;
type Operation = typeof operations[number];
const counts = new Map<string, number>();
export function recordAiResult(operation: Operation, result: "success" | "fallback") {
  const key = `${operation}:${result}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
export function aiMetricsText() {
  const lines = ["# HELP caseflow_ai_requests_total AI calls by operation and final result.", "# TYPE caseflow_ai_requests_total counter"];
  for (const operation of operations) for (const result of ["success", "fallback"]) {
    lines.push(`caseflow_ai_requests_total{operation="${operation}",result="${result}"} ${counts.get(`${operation}:${result}`) || 0}`);
  }
  return lines.join("\n") + "\n";
}
