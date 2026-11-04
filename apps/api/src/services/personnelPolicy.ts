import { z } from "zod";

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z.object({
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length),
  workStart: clock, workEnd: clock
}).strict().refine(value => value.workStart < value.workEnd, "Giờ kết thúc phải sau giờ bắt đầu.");
export const leaveSchema = z.object({ start: z.iso.date(), end: z.iso.date(), reason: z.string().trim().min(5).max(500) }).strict()
  .refine(value => value.start <= value.end && Date.parse(value.end) - Date.parse(value.start) <= 90 * 86400000, "Khoảng nghỉ tối đa 90 ngày.");
export function schoolDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function availablePersonnelFilter(now = new Date()) {
  const date = schoolDate(now);
  return { employmentStatus: { $nin: ["on_leave", "inactive"] }, leaveRequests: { $not: { $elemMatch: { status: "approved", start: { $lte: date }, end: { $gte: date } } } } };
}
export function isScheduledNow(member: { workingDays?: number[]; workStart?: string; workEnd?: string }, now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3600000);
  const clock = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  return (member.workingDays || [1,2,3,4,5]).includes(local.getUTCDay()) && clock >= (member.workStart || "08:00") && clock < (member.workEnd || "17:00");
}
