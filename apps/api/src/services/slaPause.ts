import { addBusinessHours, businessHoursBetween, type WorkingHoursCalendar } from "./workingHours.js";

export function updateSlaPause(record: { status: string; slaPausedAt?: Date | null; slaPausedHours?: number; dueAt: Date },
  previousStatus: string, now: Date, calendar: WorkingHoursCalendar) {
  if (record.status === "waiting" && previousStatus !== "waiting") record.slaPausedAt = now;
  if (record.status !== "waiting" && previousStatus === "waiting") {
    if (record.slaPausedAt) {
      const hours = businessHoursBetween(new Date(record.slaPausedAt), now, calendar);
      record.slaPausedHours = (record.slaPausedHours || 0) + hours;
      record.dueAt = addBusinessHours(new Date(record.dueAt), hours, calendar);
    }
    record.slaPausedAt = null;
  }
}
