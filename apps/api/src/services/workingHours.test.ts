import { describe, expect, it } from "vitest";
import { addBusinessHours, businessHoursBetween } from "./workingHours.js";

describe("working-hours SLA calendar", () => {
  it("rejects invalid dates and unbounded durations instead of looping", () => {
    expect(() => addBusinessHours(new Date(NaN), 8)).toThrow(RangeError);
    for (const hours of [NaN, Infinity, -1]) expect(() => addBusinessHours(new Date(), hours)).toThrow(RangeError);
    expect(() => businessHoursBetween(new Date(), new Date(NaN))).toThrow(RangeError);
  });
  it("preserves fractional hours across lunch, weekends, holidays and year boundaries", () => {
    const calendar = { holidays: ["2027-01-01", "2027-01-04"] };
    for (const start of ["2026-12-31T04:45:00Z", "2026-12-31T10:00:00Z", "2027-01-02T05:00:00Z"]) {
      for (const hours of [0.25, 1, 4, 8, 16.5]) {
        const from = new Date(start), due = addBusinessHours(from, hours, calendar);
        expect(businessHoursBetween(from, due, calendar)).toBeCloseTo(hours, 8);
      }
    }
  });
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
