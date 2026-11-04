import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { User, CaseRecord } from "../models.js";
import { scheduleSchema, leaveSchema, schoolDate } from "../services/personnelPolicy.js";
import { HttpError } from "../middleware/error.js";
import { requireRoles } from "../middleware/auth.js";
import { auditFromReq, logAudit, notify, notifyMany } from "../services/helpers.js";

export const personnelRouter = Router();
export const personnelPatch = z.object({
  employeeCode: z.string().trim().max(40),
  title: z.string().trim().max(120),
  phone: z.string().trim().max(30),
  skills: z.array(z.string().trim().min(1).max(80)).max(20),
  maxCaseload: z.number().int().min(1).max(100),
  employmentStatus: z.enum(["working", "on_leave", "inactive"]),
  joinedAt: z.iso.date().nullable(),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  workStart: z.string(), workEnd: z.string()
}).partial().strict().refine(value => Object.keys(value).length > 0)
  .refine(value => ![value.workingDays, value.workStart, value.workEnd].some(item => item !== undefined) || scheduleSchema.safeParse({ workingDays: value.workingDays, workStart: value.workStart, workEnd: value.workEnd }).success, "Cần lịch làm việc đầy đủ và hợp lệ.");
const projection = "name email role team title phone skills maxCaseload employeeCode employmentStatus joinedAt active workingDays workStart workEnd";
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(100).default("") });
const personnelManagers: RequestHandler = (req, _res, next) => {
  if (!req.auth?.personnelManager && !["manager", "org_admin", "platform_admin"].includes(req.auth?.role || "")) return next(new HttpError(403, "Không có quyền quản lý nhân sự."));
  next();
};

personnelRouter.get("/personnel", requireRoles("agent", "manager", "org_admin", "platform_admin"), async (req, res) => {
  const scope = req.auth!.personnelManager ? {} : req.auth!.role === "agent" ? { _id: req.auth!.id } : req.auth!.role === "manager" ? { team: req.auth!.team } : {};
  const { page, limit, q } = pageSchema.parse(req.query);
  const prefix = new RegExp("^" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const filter = { organizationId: req.auth!.organizationId, role: { $in: ["agent", "manager", "org_admin"] }, ...scope, ...(q ? { $or: [{ name: prefix }, { employeeCode: prefix }, { team: prefix }] } : {}) };
  const total = await User.countDocuments(filter);
  const members = await User.find(filter).select(projection).sort({ name: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean();
  const loads = await CaseRecord.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), assigneeId: { $in: members.map(member => member._id) }, mergedIntoId: null } },
    { $group: { _id: "$assigneeId", open: { $sum: { $cond: [{ $in: ["$status", ["resolved", "closed"]] }, 0, 1] } },
      completed30: { $sum: { $cond: [{ $and: [{ $in: ["$status", ["resolved", "closed"]] }, { $gte: ["$resolvedAt", new Date(Date.now() - 30 * 86400000)] }] }, 1, 0] } },
      overdue: { $sum: { $cond: [{ $and: [{ $not: [{ $in: ["$status", ["resolved", "closed", "waiting"]] }] }, { $lt: ["$dueAt", new Date()] }] }, 1, 0] } } } }
  ]);
  const byId = new Map(loads.map(load => [String(load._id), load]));
  const quality = await CaseRecord.aggregate([
    { $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), assigneeId: { $in: members.map(member => member._id) }, mergedIntoId: null, status: { $in: ["resolved", "closed"] }, resolvedAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
    { $group: { _id: "$assigneeId", total: { $sum: 1 }, onTime: { $sum: { $cond: [{ $lte: ["$resolvedAt", "$dueAt"] }, 1, 0] } }, csat: { $avg: "$satisfaction" }, rated: { $sum: { $cond: [{ $isNumber: "$satisfaction" }, 1, 0] } } } }
  ]);
  const qualityById = new Map(quality.map(item => [String(item._id), item]));
  res.json({ page, limit, total, totalPages: Math.ceil(total / limit), members: members.map(member => ({ ...member, workload: byId.get(String(member._id)) || { open: 0, completed30: 0, overdue: 0 }, quality: qualityById.get(String(member._id)) || { total: 0, onTime: 0, csat: null, rated: 0 } })) });
});

const staffRoles = requireRoles("agent", "manager", "org_admin", "platform_admin");
function managedScope(auth: NonNullable<Express.Request["auth"]>) {
  return { organizationId: auth.organizationId, ...(!auth.personnelManager && auth.role === "manager" ? { team: auth.team, role: "agent" } : { role: { $in: ["agent", "manager", "org_admin"] } }) };
}
personnelRouter.get("/personnel/leaves", staffRoles, async (req, res) => {
  const scope = { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), ...(req.auth!.role === "agent" && !req.auth!.personnelManager ? { _id: new mongoose.Types.ObjectId(req.auth!.id) } : req.auth!.role === "manager" && !req.auth!.personnelManager ? { $or: [{ role: "agent", team: req.auth!.team }, { _id: new mongoose.Types.ObjectId(req.auth!.id) }] } : { role: { $in: ["agent", "manager", "org_admin", "platform_admin"] } }) };
  const { page, limit } = pageSchema.parse(req.query);
  const [result] = await User.aggregate([
    { $match: scope }, { $unwind: "$leaveRequests" },
    { $sort: { "leaveRequests.start": -1, "leaveRequests._id": -1 } },
    { $facet: { count: [{ $count: "total" }], leaves: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0, leave: "$leaveRequests", employeeId: { $toString: "$_id" }, employeeName: "$name", team: 1 } }] } }
  ]);
  const total = result?.count[0]?.total || 0;
  res.json({ page, limit, total, totalPages: Math.ceil(total / limit), leaves: (result?.leaves || []).map((item: { leave: Record<string, unknown>; employeeId: string; employeeName: string; team: string }) => ({ ...item.leave, employeeId: item.employeeId, employeeName: item.employeeName, team: item.team })) });
});
personnelRouter.post("/personnel/leaves", staffRoles, async (req, res) => {
  const input = leaveSchema.parse(req.body);
  if (input.start < schoolDate()) throw new HttpError(422, "Không thể đăng ký nghỉ trong quá khứ.");
  const leaveId = new mongoose.Types.ObjectId();
  const member = await User.findOneAndUpdate({ _id: req.auth!.id, organizationId: req.auth!.organizationId,
    "leaveRequests.199": { $exists: false }, leaveRequests: { $not: { $elemMatch: { status: { $in: ["pending", "approved"] }, start: { $lte: input.end }, end: { $gte: input.start } } } }
  }, { $push: { leaveRequests: { ...input, _id: leaveId, status: "pending" } } });
  if (!member) throw new HttpError(409, "Đơn nghỉ trùng lịch hoặc đã đạt giới hạn 200 đơn.");
  await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: req.auth!.id, changes: { operation: "leave.request", leaveId: String(leaveId) } }, req);
  const reviewers = await User.find({ organizationId: req.auth!.organizationId, active: true, _id: { $ne: req.auth!.id }, $or: [{ role: { $in: ["org_admin", "platform_admin"] } }, { personnelManager: true }, ...(req.auth!.role === "agent" ? [{ role: "manager", team: req.auth!.team }] : [])] }).select("_id").lean();
  await notifyMany(reviewers.map(reviewer => String(reviewer._id)), { organizationId: req.auth!.organizationId, type: "leave_requested", title: "Đơn nghỉ phép chờ duyệt", message: `${req.auth!.name}: ${input.start} – ${input.end}`, actionUrl: "/personnel" });
  res.status(201).json({ id: String(leaveId) });
});
personnelRouter.patch("/personnel/:id/leaves/:leaveId", staffRoles, async (req, res) => {
  if (![req.params.id, req.params.leaveId].every(value => mongoose.isValidObjectId(value))) throw new HttpError(404, "Không tìm thấy đơn nghỉ.");
  const input = z.object({ status: z.enum(["approved", "rejected", "cancelled"]), reviewNote: z.string().trim().max(500).default("") }).strict().parse(req.body);
  const own = req.auth!.id === req.params.id;
  if (input.status === "rejected" && !input.reviewNote) throw new HttpError(422, "Cần lý do từ chối.");
  if ((input.status === "cancelled" && !own) || (input.status !== "cancelled" && (own || (req.auth!.role === "agent" && !req.auth!.personnelManager)))) throw new HttpError(403, "Không được tự duyệt hoặc hủy đơn của người khác.");
  const scope = own ? { organizationId: req.auth!.organizationId } : managedScope(req.auth!);
  const member = await User.findOneAndUpdate({ _id: req.params.id, ...scope, leaveRequests: { $elemMatch: { _id: req.params.leaveId, status: "pending", start: { $gte: schoolDate() } } } },
    { $set: { "leaveRequests.$.status": input.status, ...(input.status === "cancelled" ? { "leaveRequests.$.cancelledAt": new Date() } : { "leaveRequests.$.reviewNote": input.reviewNote, "leaveRequests.$.reviewedAt": new Date(), "leaveRequests.$.reviewedBy": req.auth!.id }) } });
  if (!member) throw new HttpError(409, "Đơn nghỉ không còn hợp lệ hoặc ngoài phạm vi quản lý.");
  await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: String(member._id), changes: { operation: "leave.review", status: input.status, leaveId: req.params.leaveId } }, req);
  if (!own) await notify({ organizationId: req.auth!.organizationId, userId: String(member._id), type: "leave_reviewed", title: input.status === "approved" ? "Đơn nghỉ phép được duyệt" : "Đơn nghỉ phép bị từ chối", actionUrl: "/personnel" });
  res.json({ ok: true });
});
personnelRouter.patch("/personnel/:id/schedule", personnelManagers, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, "Không tìm thấy nhân viên.");
  const input = scheduleSchema.parse(req.body);
  const member = await User.findOneAndUpdate({ _id: req.params.id, ...managedScope(req.auth!) }, { $set: input }, { runValidators: true });
  if (!member) throw new HttpError(404, "Không tìm thấy nhân viên trong phạm vi quản lý.");
  await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: String(member._id), changes: { operation: "schedule.update" } }, req);
  res.json({ ok: true });
});

personnelRouter.patch("/personnel/:id", personnelManagers, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, "Không tìm thấy nhân viên.");
  const input = personnelPatch.parse(req.body);
  const scope = managedScope(req.auth!);
  const member = await User.findOneAndUpdate({ _id: req.params.id, ...scope }, { $set: input }, { new: true, runValidators: true }).select(projection);
  if (!member) throw new HttpError(404, "Không tìm thấy nhân viên trong phạm vi quản lý.");
  await logAudit({ ...auditFromReq(req), action: "user.update", resource: "User", resourceId: String(member._id), changes: { operation: "personnel.update", fields: Object.keys(input) } }, req);
  res.json({ member });
});
