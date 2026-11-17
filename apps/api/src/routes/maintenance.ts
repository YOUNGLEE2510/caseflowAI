import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { MaintenanceTask, RentalAsset } from "../models/rental.js";
import { User } from "../models.js";
import { requireRoles } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateId.js";
import { HttpError } from "../middleware/error.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const maintenanceRouter = Router();
const manage = requireRoles("manager", "org_admin", "platform_admin");
const staff = requireRoles("agent", "manager", "org_admin", "platform_admin");
const create = z.object({
  assetCode: z.string().regex(/^[A-Z\d-]{1,32}$/),
  title: z.string().trim().min(3).max(160), dueAt: z.string().datetime(),
  assigneeId: z.string().regex(/^[a-f\d]{24}$/i)
}).strict();

maintenanceRouter.get("/rental/tasks", staff, async (req, res) => {
  const tasks = await MaintenanceTask.find({ organizationId: req.auth!.organizationId,
    ...(req.auth!.role === "agent" ? { assigneeId: req.auth!.id } : {})
  }).sort({ dueAt: 1, _id: 1 }).limit(100).lean();
  const owners = req.auth!.role === "agent" ? [] : await User.find({
    organizationId: req.auth!.organizationId, role: "agent", active: true
  }).select("name").sort({ name: 1 }).limit(100).lean();
  res.json({ tasks, owners });
});

maintenanceRouter.put("/rental/tasks/:key", manage, async (req, res) => {
  const key = z.string().regex(/^[a-z\d-]{16,64}$/i).parse(req.params.key);
  const input = create.parse(req.body);
  const actor = auditFromReq(req);
  const asset = await RentalAsset.findOne({ organizationId: actor.organizationId, code: input.assetCode, active: true }).select("propertyCode");
  if (!asset) throw new HttpError(422, "Thiết bị không hợp lệ.");
  if (!await User.exists({ _id: input.assigneeId, organizationId: actor.organizationId, role: "agent", active: true })) {
    throw new HttpError(422, "Người xử lý không hợp lệ.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  let task;
  try {
    task = await MaintenanceTask.findOneAndUpdate({ organizationId: actor.organizationId, key },
      { $setOnInsert: { ...input, key, fingerprint, organizationId: actor.organizationId, propertyCode: asset.propertyCode } },
      { upsert: true, new: true, runValidators: true }).select("+fingerprint");
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
    task = await MaintenanceTask.findOne({ organizationId: actor.organizationId, key }).select("+fingerprint");
  }
  if (!task || task.fingerprint !== fingerprint) throw new HttpError(409, "Mã tạo phiếu đã dùng cho nội dung khác.");
  await logAudit({ ...actor, action: "maintenance.create", resource: "MaintenanceTask", resourceId: String(task._id) }, req);
  res.json({ id: task._id });
});

maintenanceRouter.patch("/rental/tasks/:id", staff, validateObjectId("id"), async (req, res) => {
  const input = z.object({ version: z.number().int().min(0),
    status: z.enum(["in_progress", "completed", "cancelled"]), result: z.string().trim().max(2000).default("")
  }).strict().parse(req.body);
  const actor = auditFromReq(req);
  const filter = { _id: req.params.id, organizationId: actor.organizationId,
    ...(req.auth!.role === "agent" ? { assigneeId: req.auth!.id } : {}) };
  const task = await MaintenanceTask.findOne(filter);
  if (!task) throw new HttpError(404, "Không tìm thấy phiếu.");
  const allowed = task.status === "planned" ? ["in_progress", "cancelled"] : task.status === "in_progress" ? ["completed", "cancelled"] : [];
  if (!allowed.includes(input.status) || (input.status === "cancelled" && req.auth!.role === "agent")) throw new HttpError(422, "Chuyển trạng thái không hợp lệ.");
  if (["completed", "cancelled"].includes(input.status) && !input.result) throw new HttpError(422, "Cần ghi kết quả hoặc lý do.");
  const changed = await MaintenanceTask.updateOne({ ...filter, __v: input.version, status: task.status }, {
    $set: { status: input.status, result: input.result, completedAt: input.status === "completed" ? new Date() : null },
    $inc: { __v: 1 }
  });
  if (!changed.modifiedCount) throw new HttpError(409, "Phiếu đã thay đổi. Vui lòng tải lại.");
  await logAudit({ ...actor, action: "maintenance.update", resource: "MaintenanceTask", resourceId: String(task._id),
    changes: { status: input.status } }, req);
  res.status(204).end();
});
