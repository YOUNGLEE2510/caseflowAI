import { z } from "zod";
import { AuditLog, CaseHandlingRecord, CaseRecord, User } from "../models.js";
import { MaintenanceTask } from "../models/rental.js";
import { HttpError } from "../middleware/error.js";

export const STUDY_COLUMNS = ["participant", "scenario_group", "condition", "started_at", "confirmed_at", "classification_correct", "duplicate_jobs", "false_links", "case_code", "final_category", "final_priority", "ai_category", "ai_priority"];
const date = z.iso.date();
const querySchema = z.object({ from: date.optional(), to: date.optional(), participants: z.string().max(399).regex(/^p\d{2}(,p\d{2})*$/).optional() }).strict();
export function studyCsvCell(value: unknown) {
  let cell = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replaceAll('"', '""')}"`;
}
const localTime = (value: Date) => new Date(value.getTime() + 7 * 3600000).toISOString().replace("Z", "+07:00");

export async function exportStudyCsv(organizationId: string, query: unknown) {
  const input = querySchema.parse(query);
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const from = new Date(`${input.from || today}T00:00:00+07:00`);
  const to = new Date(`${input.to || today}T00:00:00+07:00`);
  if (from > to) throw new HttpError(400, "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
  const end = new Date(to.getTime() + 86400000);
  const participants = await User.find({ organizationId, role: { $ne: "requester" }, studyCode: input.participants
    ? { $in: input.participants.split(",") } : { $regex: /^p\d{2}$/ } }).select("_id studyCode").lean<any[]>();
  const records = await CaseHandlingRecord.find({ organizationId, userId: { $in: participants.map(p => p._id) },
    confirmedAt: { $gte: from, $lt: end }, firstOpenedAt: { $ne: null }, $expr: { $lte: ["$firstOpenedAt", "$confirmedAt"] }
  }).sort({ confirmedAt: 1, _id: 1 }).limit(10001).lean<any[]>();
  if (records.length > 10000) throw new HttpError(422, "Chọn khoảng thời gian nhỏ hơn để xuất tối đa 10000 dòng.");
  const caseIds = records.map(r => r.caseId);
  const cases = await CaseRecord.find({ organizationId, _id: { $in: caseIds } })
    .select("code study.scenarioGroup ai.classification ai.suggestedPriority").lean<any[]>();
  const caseMap = new Map(cases.map(item => [String(item._id), item]));
  const participantMap = new Map(participants.map(p => [String(p._id), p.studyCode]));
  const userIds = participants.map(p => p._id);
  const [tasks, events] = await Promise.all([
    MaintenanceTask.find({ organizationId, caseId: { $in: caseIds }, createdById: { $in: userIds } })
      .select("caseId createdById").lean<any[]>(),
    AuditLog.find({ organizationId, action: { $in: ["incident.link", "incident.unlink"] }, "changes.caseId": { $in: caseIds.map(String) } })
      .select("actorId action resourceId changes.caseId createdAt").sort({ createdAt: 1, _id: 1 }).lean<any[]>()
  ]);
  const taskCounts = new Map<string, number>();
  for (const task of tasks) {
    const key = `${task.createdById}:${task.caseId}`;
    taskCounts.set(key, (taskCounts.get(key) || 0) + 1);
  }
  const links = new Map<string, string>();
  const removedCounts = new Map<string, number>();
  for (const event of events) {
    const pair = `${event.resourceId}:${event.changes.caseId}`;
    if (event.action === "incident.link") links.set(pair, String(event.actorId));
    else {
      const author = links.get(pair);
      if (author) { const key = `${author}:${event.changes.caseId}`; removedCounts.set(key, (removedCounts.get(key) || 0) + 1); }
      links.delete(pair);
    }
  }
  const rows = records.flatMap(record => {
    const item = caseMap.get(String(record.caseId));
    if (!item) return [];
    const key = `${record.userId}:${record.caseId}`;
    return [[participantMap.get(String(record.userId)), item.study?.scenarioGroup || "", record.confirmedAiHidden ? "manual" : "assisted",
      localTime(record.firstOpenedAt), localTime(record.confirmedAt), "", Math.max(0, (taskCounts.get(key) || 0) - 1), removedCounts.get(key) || 0,
      item.code, record.finalCategory, record.finalPriority, item.ai?.classification || "", item.ai?.suggestedPriority || ""]];
  });
  return { csv: "\uFEFF" + [STUDY_COLUMNS, ...rows].map(row => row.map(studyCsvCell).join(",")).join("\r\n"), rows: rows.length };
}
