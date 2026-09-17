import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { validateObjectId } from "../middleware/validateId.js";
import { CaseRecord, ServiceDefinition, User } from "../models.js";
import { auditFromReq, logAudit, notify } from "../services/helpers.js";
import { resolveAiReviewStatus } from "../services/routing.js";
import { presentCase, validateStatusTransition } from "../services/casePolicy.js";
export const caseActionsRouter = Router();
caseActionsRouter.use(authenticate);
caseActionsRouter.get("/cases/:id/assignment-options", validateObjectId("id"), requireRoles("agent", "manager", "org_admin", "platform_admin"), async (req, res) => {
  const record = await CaseRecord.findOne({ _id: req.params.id, organizationId: req.auth!.organizationId }).lean<{ team: string; serviceKey: string; category: string }>();
  if (!record) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  const [agents, workloads] = await Promise.all([
    User.find({ organizationId: req.auth!.organizationId, role: "agent", active: true, team: record.team })
      .select("name skills maxCaseload").lean(),
    CaseRecord.aggregate([
      { $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), status: { $nin: ["resolved", "closed"] }, assigneeId: { $ne: null } } },
      { $group: { _id: "$assigneeId", open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $lt: ["$dueAt", new Date()] }, 1, 0] } } } }
    ])
  ]);
  const loads = new Map(workloads.map((row) => [String(row._id), row]));
  const options = agents.map((agent) => {
    const load = loads.get(String(agent._id));
    const open = Number(load?.open || 0);
    const capacity = Number.isFinite(agent.maxCaseload) && agent.maxCaseload > 0 ? agent.maxCaseload : 15;
    return { id: String(agent._id), name: agent.name, open, overdue: Number(load?.overdue || 0), capacity,
      atCapacity: open >= capacity, skillMatch: (agent.skills || []).some((skill: string) => [record.serviceKey, record.category].includes(skill)), utilization: open / capacity };
  }).sort((a, b) => Number(a.atCapacity) - Number(b.atCapacity) || Number(b.skillMatch) - Number(a.skillMatch) || a.utilization - b.utilization || a.overdue - b.overdue || a.id.localeCompare(b.id));
  res.json({ options, generatedAt: new Date().toISOString(), policy: "capacity-skill-utilization", advisory: true });
});
interface LeanService {
  _id: mongoose.Types.ObjectId;
  key: string;
  category: string;
  team: string;
  slaHours: number;
  requiredFields: string[];
}

interface LeanAssignee {
  _id: mongoose.Types.ObjectId;
  name: string;
  team?: string;
}

const updateCaseSchema = z.object({
  status: z.enum(["new", "triaged", "in_progress", "waiting", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigneeId: z.string().nullable().optional(),
  team: z.string().trim().min(2).optional(),
  serviceKey: z.string().trim().min(2).max(50).optional(),
  confirmAi: z.boolean().optional()
});

const commentSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  internal: z.boolean().default(false)
});

caseActionsRouter.patch(
  "/cases/:id",
  validateObjectId("id"),
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const input = updateCaseSchema.parse(req.body);
    const record = await CaseRecord.findOne({
      _id: req.params.id,
      organizationId: req.auth!.organizationId
    });
    if (!record) throw new HttpError(404, "Không tìm thấy hồ sơ.");

    if (["resolved", "closed"].includes(record.status) && (input.serviceKey || input.assigneeId !== undefined || input.team)) throw new HttpError(422, "Hãy mở lại hồ sơ trước khi đổi phân công hoặc dịch vụ.");

    const events: any[] = [];
    const markAiReviewed = (selectedCategory: string) => {
      const reviewStatus = resolveAiReviewStatus(record.ai.classification, selectedCategory);
      record.ai.reviewStatus = reviewStatus;
      record.ai.reviewedAt = new Date();
      record.ai.reviewedById = new mongoose.Types.ObjectId(req.auth!.id);
      record.ai.reviewedByName = req.auth!.name;
      record.ai.humanCorrectedLabel = reviewStatus === "corrected" ? selectedCategory : null;
      if (record.status === "new") record.status = "triaged";
      events.push({
        type: "ai_reviewed",
        label:
          reviewStatus === "confirmed"
            ? `Đã xác nhận phân loại AI: ${selectedCategory}`
            : `Đã điều chỉnh phân loại AI thành ${selectedCategory}`,
        actorId: req.auth!.id,
        actorName: req.auth!.name
      });
    };

    if (input.serviceKey) {
      const service = await ServiceDefinition.findOne({
        organizationId: req.auth!.organizationId,
        key: input.serviceKey,
        active: true
      }).lean<LeanService>();
      if (!service) throw new HttpError(422, "Dịch vụ được chọn không hợp lệ.");

      if (record.status !== "new" && record.team !== service.team) record.transferCount += 1;
      if (record.team !== service.team) {
        record.assigneeId = null;
        record.assigneeName = "";
        if (["in_progress", "waiting"].includes(record.status)) record.status = "triaged";
      }
      record.serviceKey = service.key;
      record.category = service.category;
      record.team = service.team;
      record.dueAt = new Date(record.createdAt.getTime() + service.slaHours * 3_600_000);
      markAiReviewed(service.category);
    } else if (input.confirmAi) {
      markAiReviewed(record.category);
    }

    if (input.priority) record.priority = input.priority;
    if (input.team && input.team !== record.team) {
      throw new HttpError(422, "Đổi dịch vụ để chuyển hồ sơ sang đơn vị phụ trách tương ứng.");
    }
    if (input.assigneeId !== undefined) {
      if (input.assigneeId) {
        const assignee = (await User.findOne({
          _id: input.assigneeId,
          organizationId: req.auth!.organizationId,
          role: "agent",
          team: record.team,
          active: true
        }).lean()) as LeanAssignee | null;
        if (!assignee) throw new HttpError(422, "Nhân viên được chọn không hợp lệ.");
        record.assigneeId = assignee._id;
        record.assigneeName = assignee.name;
        if (record.ai.reviewStatus === "pending") markAiReviewed(record.category);
        events.push({
          type: "assigned",
          label: `Đã giao cho ${assignee.name}`,
          actorId: req.auth!.id,
          actorName: req.auth!.name
        });
      } else {
        if (["in_progress", "waiting"].includes(record.status)) throw new HttpError(422, "Hồ sơ đang xử lý cần có người phụ trách.");
        record.assigneeId = null;
        record.assigneeName = "";
      }
    }
    if (input.status && input.status !== record.status) {
      validateStatusTransition(record.status, input.status, record.ai.reviewStatus !== "pending", Boolean(record.assigneeId));
      events.push({ type: "status_changed", label: `Chuyển trạng thái từ ${record.status} sang ${input.status}`, actorId: req.auth!.id, actorName: req.auth!.name });
      if (["resolved", "closed"].includes(record.status) && input.status === "in_progress") {
        record.resolvedAt = null;
        record.closedAt = null;
        record.reopenCount += 1;
      }
      if (input.status === "resolved") record.resolvedAt = new Date();
      if (input.status === "closed") record.closedAt = new Date();
      record.status = input.status;
    }
    record.events.push(...events);
    await record.save();

    await logAudit({
      ...auditFromReq(req),
      action:
        input.serviceKey || input.confirmAi
          ? "case.triage"
          : input.assigneeId !== undefined
            ? "case.assign"
            : "case.update",
      resource: "CaseRecord",
      resourceId: String(record._id),
      changes: input
    }, req);

    if (input.assigneeId && input.assigneeId !== req.auth!.id) {
      await notify({
        organizationId: req.auth!.organizationId,
        userId: input.assigneeId,
        type: "case_assigned",
        title: `Bạn được giao hồ sơ ${record.code}`,
        message: `"${record.title}" đã được ${req.auth!.name} giao cho bạn.`,
        relatedCaseId: String(record._id),
        actionUrl: `/cases/${record._id}`
      });
    }

    if (input.status === "resolved" && String(record.requesterId) !== req.auth!.id) {
      await notify({
        organizationId: req.auth!.organizationId,
        userId: String(record.requesterId),
        type: "case_updated",
        title: `Yêu cầu ${record.code} đã được giải quyết`,
        message: `Hồ sơ "${record.title}" đã được xử lý xong.`,
        relatedCaseId: String(record._id),
        actionUrl: `/cases/${record._id}`
      });
    }

    res.json({ case: presentCase(record, req.auth!.role) });
  }
);

/* ── Case Comments ── */

caseActionsRouter.post("/cases/:id/comments", validateObjectId("id"), async (req, res) => {
  const input = commentSchema.parse(req.body);
  if (input.internal && req.auth!.role === "requester") {
    throw new HttpError(403, "Người yêu cầu không thể tạo ghi chú nội bộ.");
  }
  const filter: any = { _id: req.params.id, organizationId: req.auth!.organizationId };
  if (req.auth!.role === "requester") filter.requesterId = req.auth!.id;
  const record = await CaseRecord.findOne(filter);
  if (!record) throw new HttpError(404, "Không tìm thấy hồ sơ.");

  record.comments.push({
    authorId: new mongoose.Types.ObjectId(req.auth!.id),
    authorName: req.auth!.name,
    body: input.body,
    internal: input.internal,
    createdAt: new Date()
  } as any);
  record.events.push({
    type: "commented",
    label: input.internal ? "Đã thêm ghi chú nội bộ" : "Đã thêm phản hồi",
    internal: input.internal,
    actorId: new mongoose.Types.ObjectId(req.auth!.id),
    actorName: req.auth!.name,
    createdAt: new Date()
  } as any);
  await record.save();

  await logAudit({
    ...auditFromReq(req),
    action: "case.comment",
    resource: "CaseRecord",
    resourceId: String(record._id),
    changes: { internal: input.internal }
  }, req);

  if (!input.internal && record.assigneeId && String(record.assigneeId) !== req.auth!.id) {
    await notify({
      organizationId: req.auth!.organizationId,
      userId: String(record.assigneeId),
      type: "case_commented",
      title: `Phản hồi mới trên ${record.code}`,
      message: `${req.auth!.name}: "${input.body.slice(0, 100)}"`,
      relatedCaseId: String(record._id),
      actionUrl: `/cases/${record._id}`
    });
  }

  if (!input.internal && String(record.requesterId) !== req.auth!.id) {
    await notify({
      organizationId: req.auth!.organizationId,
      userId: String(record.requesterId),
      type: "case_commented",
      title: `Cập nhật trên yêu cầu ${record.code}`,
      message: `Nhân viên ${req.auth!.name} đã phản hồi yêu cầu của bạn.`,
      relatedCaseId: String(record._id),
      actionUrl: `/cases/${record._id}`
    });
  }

  res.status(201).json({ case: presentCase(record, req.auth!.role) });
});
