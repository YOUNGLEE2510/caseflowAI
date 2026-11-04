import { describe, expect, it } from "vitest";
import { updateSlaPause } from "../src/services/slaPause.js";

describe("SLA pauses", () => {
  it("excludes lunch and weekends when extending the deadline", () => {
    const record = { status: "waiting", dueAt: new Date("2026-10-19T10:00:00Z"), slaPausedAt: null as Date | null, slaPausedHours: 0 };
    updateSlaPause(record, "in_progress", new Date("2026-10-16T09:00:00Z"), {});
    record.status = "in_progress";
    updateSlaPause(record, "waiting", new Date("2026-10-19T02:00:00Z"), {});
    expect(record.slaPausedHours).toBe(2);
    expect(record.slaPausedAt).toBeNull();
    expect(record.dueAt.toISOString()).toBe("2026-10-20T03:00:00.000Z");
  });
});
