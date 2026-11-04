import { describe, expect, it } from "vitest";
import { parseUserCsv } from "../src/services/userCsv.js";
import { aiMetricsText, recordAiResult } from "../src/services/aiMetrics.js";
describe("bounded user imports", () => {
  it("supports BOM and quoted commas", () => {
    expect(parseUserCsv('\uFEFFname,email,role,team\n"Nguyen, An",AN@example.com,requester,')[0]).toMatchObject({ name: "Nguyen, An", email: "an@example.com" });
  });
  it("rejects privileged roles, duplicates and unexpected columns", () => {
    for (const csv of ["name,email,role,team\nAdmin,a@b.com,org_admin,", "name,email,role,team\nAn,a@b.com,requester,\nAn,A@b.com,requester,", "name,email,role,password\nAn,a@b.com,requester,secret"]) expect(() => parseUserCsv(csv)).toThrow();
  });
  it("requires agent teams", () => expect(() => parseUserCsv("name,email,role,team\nAn,a@b.com,agent,")).toThrow());
  it("exports bounded Prometheus counters without user data", () => {
    recordAiResult("classify", "fallback");
    expect(aiMetricsText()).toContain('caseflow_ai_requests_total{operation="classify",result="fallback"} 1');
  });
});
