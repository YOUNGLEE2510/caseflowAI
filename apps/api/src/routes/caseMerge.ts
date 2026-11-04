import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { CaseRecord } from "../models.js";
import { requireRoles } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateId.js";
import { HttpError } from "../middleware/error.js";
import { caseScope, presentCase } from "../services/casePolicy.js";
import { auditFromReq, logAudit, notify } from "../services/helpers.js";

export const caseMergeRouter = Router();
const managers = requireRoles("manager", "org_admin", "platform_admin");

caseMergeRouter.get("/cases/:id/merge-options", validateObjectId("id"), managers, async (req, res) => {
  const source = await CaseRecord.findOne({ _id: req.params.id, ...caseScope(req.auth!) });
  if (!source) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  const cases = await CaseRecord.find({ ...caseScope(req.auth!), $or: [{ createdAt: { $lt: source.createdAt } }, { createdAt: source.createdAt, _id: { $lt: source._id } }],
    requesterId: source.requesterId, serviceKey: source.serviceKey, mergedIntoId: null,
    status: { $nin: ["resolved", "closed"] } }).select("code title status").sort({ createdAt: -1, _id: -1 }).limit(50).lean();
  res.json({ cases });
});

caseMergeRouter.post("/cases/:id/merge", validateObjectId("id"), managers, async (req, res) => {
  const input = z.object({ targetId: z.string().refine(value => mongoose.isValidObjectId(value)),
    reason: z.enum(["duplicate_submission", "repeated_request"]) }).strict().parse(req.body);
  const scope = caseScope(req.auth!);
  const [source, target] = await Promise.all([
    CaseRecord.findOne({ _id: req.params.id, ...scope }), CaseRecord.findOne({ _id: input.targetId, ...scope })
  ]);
  if (!source || !target) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  if (source.mergedIntoId) {
    if (String(source.mergedIntoId) !== String(target._id)) throw new HttpError(409, "Hồ sơ đã được gộp vào hồ sơ khác.");
    res.json({ case: presentCase(source, req.auth!.role), targetId: String(target._id), alreadyMerged: true }); return;
  }
  // Immutable creation time and ID ordering keep concurrent merges acyclic on standalone MongoDB.
  const targetTime = new Date(target.createdAt).getTime(), sourceTime = new Date(source.createdAt).getTime();
  if (!Number.isFinite(targetTime) || !Number.isFinite(sourceTime) || targetTime > sourceTime || targetTime === sourceTime && String(target._id) >= String(source._id)) throw new HttpError(422, "Giữ hồ sơ được tạo trước làm hồ sơ chính.");
  if (String(source.requesterId) !== String(target.requesterId) || source.serviceKey !== target.serviceKey) throw new HttpError(422, "Chỉ gộp hồ sơ cùng người yêu cầu và cùng dịch vụ.");
  if (target.mergedIntoId || ["resolved", "closed"].includes(source.status) || ["resolved", "closed"].includes(target.status)) throw new HttpError(422, "Cần chọn hai hồ sơ còn mở và hồ sơ chính chưa được gộp.");
  const now = new Date();
  const merged = await CaseRecord.findOneAndUpdate({ _id: source._id, ...scope, __v: source.__v,
    mergedIntoId: null, status: source.status }, { $set: { mergedIntoId: target._id, mergedAt: now,
    mergedById: req.auth!.id, status: "closed", closedAt: now, slaPausedAt: null }, $inc: { __v: 1 },
    $push: { events: { type: "merged", label: `Đã gộp vào hồ sơ ${target.code}`, actorId: req.auth!.id,
      actorName: req.auth!.name, createdAt: now, metadata: { targetId: String(target._id), reason: input.reason } } } }, { new: true, runValidators: true });
  if (!merged) throw new HttpError(409, "Hồ sơ vừa thay đổi. Vui lòng tải lại trước khi gộp.");
  await logAudit({ ...auditFromReq(req), action: "case.merge", resource: "CaseRecord", resourceId: String(source._id),
    changes: { targetId: String(target._id), reason: input.reason } }, req);
  await notify({ organizationId: req.auth!.organizationId, userId: String(source.requesterId), type: "case_updated",
    title: `Hồ sơ ${source.code} đã được gộp`, message: `Tiếp tục theo dõi tiến độ tại ${target.code}.`,
    relatedCaseId: String(target._id), actionUrl: `/cases/${target._id}` });
  res.json({ case: presentCase(merged, req.auth!.role), targetId: String(target._id), alreadyMerged: false });
});
