import mongoose from "mongoose";
import type { AuthUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import type { CaseStatus } from "../models.js";

// FSM chuyển trạng thái hồ sơ — mỗi trạng thái chỉ có thể chuyển sang
// các trạng thái hợp lệ. Ngăn chặn nhảy từ "new" → "resolved" mà không
// qua bước triage + assign.
export const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  new: ["triaged"],
  triaged: ["in_progress", "waiting"],
  in_progress: ["waiting", "resolved"],
  waiting: ["in_progress", "resolved"],
  resolved: ["closed", "in_progress"],  // closed → in_progress = reopen
  closed: ["in_progress"]
};

export function caseScope(auth: AuthUser): Record<string, unknown> {
  // Requester chỉ xem hồ sơ của mình; agent chỉ làm việc trong đơn vị được gán.
  return {
    organizationId: new mongoose.Types.ObjectId(auth.organizationId),
    ...(auth.role === "requester" ? { requesterId: new mongoose.Types.ObjectId(auth.id) } : {}),
    ...(auth.role === "agent" ? { team: auth.team } : {})
  };
}

export function presentCase(record: any, role: AuthUser["role"]) {
  const value = typeof record.toObject === "function" ? record.toObject({ flattenMaps: true }) : { ...record };
  if (role !== "requester") return value;
  return {
    ...value,
    // NOTE: lọc comment/event internal ở tầng present, không phải tầng query.
    // Nghĩa là DB vẫn trả hết, chỉ ẩn khi serialize cho requester.
    comments: (value.comments || []).filter((comment: any) => !comment.internal),
    events: (value.events || []).filter((event: any) => !event.internal),
    ai: { ...value.ai, similarCaseIds: [], suggestedResponse: "" }
  };
}

export function validateStatusTransition(from: CaseStatus, to: CaseStatus, reviewed: boolean, assigned: boolean) {
  if (from === to) return;
  if (!STATUS_TRANSITIONS[from].includes(to)) throw new HttpError(422, "Không thể chuyển trực tiếp sang trạng thái này.");
  if (!reviewed) throw new HttpError(422, "Cần xác nhận phân luồng trước khi xử lý hồ sơ.");
  if (["in_progress", "resolved"].includes(to) && !assigned) throw new HttpError(422, "Cần giao người phụ trách trước khi xử lý hồ sơ.");
}

export function pageNumber(value: unknown, fallback: number, maximum: number) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), maximum) : fallback;
}
