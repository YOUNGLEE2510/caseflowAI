import { describe, expect, it } from "vitest";
import { personnelPatch } from "../src/routes/personnel.js";
import { scheduleSchema, leaveSchema, schoolDate, availablePersonnelFilter, isScheduledNow } from "../src/services/personnelPolicy.js";

describe("personnel validation", () => {
  it("validates leave dates and bounded schedules", () => {
    expect(leaveSchema.safeParse({ start: "2026-12-02", end: "2026-12-01", reason: "Personal leave" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ workingDays: [1,1], workStart: "08:00", workEnd: "17:00" }).success).toBe(false);
    expect(scheduleSchema.safeParse({ workingDays: [1], workStart: "18:00", workEnd: "17:00" }).success).toBe(false);
    expect(schoolDate(new Date("2026-10-28T18:00:00Z"))).toBe("2026-10-29");
    expect(availablePersonnelFilter(new Date("2026-10-28T18:00:00Z")).leaveRequests.$not.$elemMatch.start.$lte).toBe("2026-10-29");
  });
  it("uses local working days and excludes the end boundary", () => {
    const member = { workingDays: [3], workStart: "08:00", workEnd: "17:00" };
    expect(isScheduledNow(member, new Date("2026-10-28T01:00:00Z"))).toBe(true);
    expect(isScheduledNow(member, new Date("2026-10-28T10:00:00Z"))).toBe(false);
    expect(isScheduledNow(member, new Date("2026-10-29T01:00:00Z"))).toBe(false);
  });
  it("does not permit account or access changes", () => {
    for (const field of ["role", "password", "active", "organizationId", "team", "email"]) {
      expect(personnelPatch.safeParse({ [field]: "changed" }).success).toBe(false);
    }
  });
  it("bounds capacity and accepts an employment update", () => {
    expect(personnelPatch.safeParse({ maxCaseload: 0 }).success).toBe(false);
    expect(personnelPatch.safeParse({}).success).toBe(false);
    expect(personnelPatch.parse({ employmentStatus: "on_leave", maxCaseload: 12 })).toEqual({ employmentStatus: "on_leave", maxCaseload: 12 });
  });
});
