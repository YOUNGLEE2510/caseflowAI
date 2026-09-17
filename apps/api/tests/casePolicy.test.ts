import { describe, expect, it } from "vitest";
import { caseScope, pageNumber, presentCase, validateStatusTransition } from "../src/services/casePolicy.js";

describe("case policy", () => {
  it("rejects skipping triage", () => {
    expect(() => validateStatusTransition("new", "resolved", true, true)).toThrow();
  });
  it("requires routing review", () => {
    expect(() => validateStatusTransition("triaged", "in_progress", false, true)).toThrow();
  });
  it("requires an assignee", () => {
    expect(() => validateStatusTransition("in_progress", "resolved", true, false)).toThrow();
  });
  it("allows reviewed and assigned resolution", () => {
    expect(() => validateStatusTransition("in_progress", "resolved", true, true)).not.toThrow();
  });
  it("allows reopening closed cases", () => {
    expect(() => validateStatusTransition("closed", "in_progress", true, true)).not.toThrow();
  });
  it("treats unchanged status as a no-op", () => {
    expect(() => validateStatusTransition("new", "new", false, false)).not.toThrow();
  });
  it("scopes requesters to their own organization and records", () => {
    const scope = caseScope({ id: "111111111111111111111111", organizationId: "222222222222222222222222", role: "requester" } as Parameters<typeof caseScope>[0]);
    expect(String(scope.requesterId)).toBe("111111111111111111111111");
    expect(String(scope.organizationId)).toBe("222222222222222222222222");
  });
  it("redacts internal content without mutating the record", () => {
    const record = { comments: [{ internal: true }, { internal: false }], events: [{ internal: true }], ai: { similarCaseIds: ["private"], suggestedResponse: "private" } };
    const visible = presentCase(record, "requester");
    expect(visible.comments).toHaveLength(1);
    expect(visible.events).toEqual([]);
    expect(visible.ai.similarCaseIds).toEqual([]);
    expect(record.comments).toHaveLength(2);
    expect(presentCase(record, "agent").ai.suggestedResponse).toBe("private");
  });
  it("bounds pagination and rejects invalid values", () => {
    expect(pageNumber("999", 1, 100)).toBe(100);
    expect(pageNumber("NaN", 1, 100)).toBe(1);
    expect(pageNumber("-1", 1, 100)).toBe(1);
  });
});
