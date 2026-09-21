import { describe, expect, it } from "vitest";
import { addBusinessHours, businessHoursBetween } from "./workingHours.js";

describe("working-hours SLA calendar", () => {
  it("moves a Friday after-hours SLA into the next business day", () => {
    const due = addBusinessHours(new Date("2026-01-02T10:00:00.000Z"), 8);
    expect(due.toISOString()).toBe("2026-01-05T10:00:00.000Z");
  });

  it("excludes lunch, weekends, and configured holidays", () => {
    const due = addBusinessHours(new Date("2026-01-01T04:00:00.000Z"), 7, { holidays: ["2026-01-02"] });
    expect(due.toISOString()).toBe("2026-01-05T03:00:00.000Z");
    expect(businessHoursBetween(new Date("2026-01-01T04:00:00.000Z"), due, { holidays: ["2026-01-02"] })).toBe(7);
  });
});
