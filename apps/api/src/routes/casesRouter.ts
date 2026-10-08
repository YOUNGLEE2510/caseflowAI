import { Router } from "express";
import { publicUser, type PublicUserSource } from "../services/publicUser.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { validateObjectId } from "../middleware/validateId.js";
import {
  CASE_STATUSES,
  CaseRecord,
  Incident,
  Organization,
  ServiceDefinition,
  User
} from "../models.js";
import {
  classifyText,
  findSimilarCases,
  predictSla
} from "../services/aiClient.js";
import { auditFromReq, logAudit, notify, notifyMany } from "../services/helpers.js";
import { canUseAiRouting } from "../services/routing.js";
import { caseScope, pageNumber, presentCase, validateStatusTransition } from "../services/casePolicy.js";
import { addBusinessHours, organizationCalendar } from "../services/workingHours.js";

interface LeanService {
  _id: mongoose.Types.ObjectId;
  key: string;
  category: string;
  team: string;
  slaHours: number;
  requiredFields: string[];
}

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeCaseFilter(organizationId: string) {
  return {
    organizationId,
    status: { $nin: ["resolved", "closed"] }
  };
}

function nextCaseCode() {
  return `CF-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
}

const intakeSchema = z.object({
  title: z.string().trim().max(160).optional(),
  description: z.string().trim().min(12).max(5_000),
  serviceKey: z.string().trim().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  channel: z.enum(["portal", "phone", "email", "walk_in", "api"]).default("portal"),
  customFields: z.record(z.string().max(2000)).default({})
});

export const casesRouter = Router();

/* ── Dashboard ── */

/* ── Case Counts ── */

casesRouter.get("/cases/counts", async (req, res) => {
  const scope = caseScope(req.auth!);
  const result = await CaseRecord.aggregate([
    { $match: scope },
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  const counts: Record<string, number> = { all: 0 };
  for (const item of result) {
    counts[item._id] = item.count;
    counts.all += item.count;
  }
  res.json({ counts });
});

/* ── Case List ── */

casesRouter.get("/cases", async (req, res) => {
  const filter: any = caseScope(req.auth!);
  if (req.auth!.role === "requester" || req.query.mine === "true") {
    filter.requesterId = req.auth!.id;
  }
  if (typeof req.query.status === "string" && req.query.status !== "all") filter.status = z.enum(CASE_STATUSES).parse(req.query.status);
  if (typeof req.query.priority === "string" && req.query.priority !== "all") filter.priority = z.enum(["low", "normal", "high", "urgent"]).parse(req.query.priority);
  if (typeof req.query.serviceKey === "string" && req.query.serviceKey !== "all") filter.serviceKey = req.query.serviceKey.slice(0, 50);
  const queue = z.enum(["all", "unassigned", "assigned", "overdue", "due_soon"]).parse(req.query.queue || "all");
  if (queue !== "all") {
    if (req.auth!.role === "requester") throw new HttpError(403, "Hàng đợi vận hành chỉ dành cho nhân viên.");
    const conditions: any[] = [{ status: { $nin: ["resolved", "closed"] } }];
    if (queue === "unassigned") conditions.push({ assigneeId: null });
    if (queue === "assigned") conditions.push({ assigneeId: req.auth!.id });
    const now = new Date();
    if (queue === "overdue") conditions.push({ dueAt: { $lt: now } });
    if (queue === "due_soon") conditions.push({ dueAt: { $gte: now, $lte: new Date(now.getTime() + 86_400_000) } });
    filter.$and = conditions;
  }
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const pattern = new RegExp(escapeRegex(req.query.search.trim()), "i");
    filter.$or = [{ code: pattern }, { title: pattern }, { requesterName: pattern }];
  }

  const page = pageNumber(req.query.page, 1, 100000);
  const limit = pageNumber(req.query.limit, 8, 50);
  const skip = (page - 1) * limit;

  const sortField = req.query.sort === "dueAt" || queue !== "all" ? "dueAt" : "updatedAt";
  const sortOrder = queue !== "all" || req.query.order === "asc" ? 1 : -1;

  const [cases, total] = await Promise.all([
    CaseRecord.find(filter).sort({ [sortField]: sortOrder, _id: 1 }).skip(skip).limit(limit).lean(),
    CaseRecord.countDocuments(filter)
  ]);

  res.json({ cases: cases.map((item) => presentCase(item, req.auth!.role)), total, page, limit, totalPages: Math.ceil(total / limit) });
});

/* ── AI Analyze Intake (pre-submit) ── */

casesRouter.post("/ai/analyze-intake", async (req, res) => {
  const input = z.object({ text: z.string().min(12).max(5_000) }).parse(req.body);
  const [classification, openCases] = await Promise.all([
    classifyText(input.text),
    CaseRecord.find({ ...activeCaseFilter(req.auth!.organizationId), ...caseScope(req.auth!) })
      .select("_id title description")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
  ]);

  const similar = await findSimilarCases(
    input.text,
    openCases.map((item: any) => ({
      id: String(item._id),
      title: item.title,
      text: `${item.title}. ${item.description}`
    }))
  );
  const service = await ServiceDefinition.findOne({
    organizationId: req.auth!.organizationId,
    category: classification.label,
    active: true
  }).lean();

  res.json({
    classification,
    similar,
    service,
    needsReview: !service || !canUseAiRouting(classification.confidence)
  });
});

/* ── Create Case ── */

casesRouter.post("/cases", async (req, res) => {
  const input = intakeSchema.parse(req.body);
  if (req.auth!.role === "requester" && input.channel !== "portal") {
    throw new HttpError(422, "Người gửi yêu cầu chỉ được sử dụng kênh cổng trực tuyến.");
  }
  const [classification, openCases, organization] = await Promise.all([
    classifyText(`${input.title || ""}. ${input.description}`),
    CaseRecord.find({ ...activeCaseFilter(req.auth!.organizationId), ...caseScope(req.auth!) })
      .select("_id title description")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Organization.findById(req.auth!.organizationId).select("settings.holidayDates").lean()
  ]);

  const service = (
    (input.serviceKey
      ? await ServiceDefinition.findOne({
          organizationId: req.auth!.organizationId,
          key: input.serviceKey,
          active: true
        }).lean()
      : null) ||
    (await ServiceDefinition.findOne({
      organizationId: req.auth!.organizationId,
      key: "general_support",
      active: true
    }).lean())) as LeanService | null;

  if (!service) throw new HttpError(422, "Tổ chức chưa cấu hình dịch vụ phù hợp.");
  const allowedFields = new Set(service.requiredFields || []);
  if (Object.keys(input.customFields).some((field) => !allowedFields.has(field))) {
    throw new HttpError(422, "Thông tin bổ sung chứa trường không thuộc dịch vụ được chọn.");
  }
  if (input.serviceKey && service.key !== input.serviceKey) throw new HttpError(422, "Dịch vụ được chọn không còn hoạt động.");
  for (const field of service.requiredFields || []) {
    if (!input.customFields[field]?.trim()) throw new HttpError(422, `Vui lòng bổ sung: ${field}.`);
  }

  const similar = await findSimilarCases(
    `${input.title || ""}. ${input.description}`,
    openCases.map((item: any) => ({
      id: String(item._id),
      title: item.title,
      text: `${item.title}. ${item.description}`
    }))
  );

  const workload = await CaseRecord.countDocuments({
    organizationId: req.auth!.organizationId,
    team: service.team,
    status: { $nin: ["resolved", "closed"] }
  });
  const sla = await predictSla({
    elapsedHours: 0,
    dueHours: service.slaHours,
    transfers: 0,
    workload,
    remainingSteps: 3,
    priority: input.priority
  });
  const dueAt = addBusinessHours(
    new Date(),
    service.slaHours,
    organizationCalendar((organization as { settings?: { holidayDates?: string[] } } | null)?.settings)
  );
  const title =
    input.title?.trim() ||
    classification.summary.split(/[.!?]/)[0]?.trim().slice(0, 120) ||
    "Yêu cầu hỗ trợ mới";

  const casePayload = {
    organizationId: req.auth!.organizationId,
    title,
    description: input.description,
    customFields: Object.fromEntries((service.requiredFields || []).map((field) => [field, input.customFields[field].trim()])),
    serviceKey: service.key,
    category: service.category,
    priority: input.priority,
    status: "new",
    channel: input.channel,
    requesterId: req.auth!.id,
    requesterName: req.auth!.name,
    assigneeId: null,
    assigneeName: "",
    team: service.team,
    dueAt,
    ai: {
      classification: classification.label,
      confidence: classification.confidence,
      summary: classification.summary,
      modelVersion: classification.modelVersion || `${classification.provider}-unversioned`,
      extracted: classification.extracted,
      riskScore: sla.riskScore,
      riskFactors: sla.factors,
      similarCaseIds: similar.map((item) => item.id),
      analyzedAt: new Date(),
      reviewStatus: "pending"
    },
    events: [
      {
        type: "created",
        label: `Tiếp nhận từ kênh ${input.channel}`,
        actorId: req.auth!.id,
        actorName: req.auth!.name
      },
      {
        type: "ai_triage",
        label: `AI đề xuất ${classification.label} cho ${service.team} với độ tin cậy ${Math.round(
          classification.confidence * 100
        )}%; đang chờ nhân viên xác nhận`,
        actorName: "CaseFlow AI"
      }
    ]
  };

  let record: any;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      record = (await CaseRecord.create({ ...casePayload, code: nextCaseCode() })) as any;
      break;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === 2) throw error;
    }
  }

  await logAudit({
    ...auditFromReq(req),
    action: "case.create",
    resource: "CaseRecord",
    resourceId: String(record._id),
    changes: { title, serviceKey: service.key, priority: input.priority }
  }, req);

  const triageRecipients = await User.find({
    organizationId: req.auth!.organizationId,
    active: true,
    $or: [
      { role: { $in: ["manager", "org_admin", "platform_admin"] } },
      { role: "agent", team: service.team }
    ]
  })
    .select("_id")
    .lean();
  await notifyMany(
    triageRecipients.map((recipient) => String(recipient._id)),
    {
      organizationId: req.auth!.organizationId,
      type: "case_updated",
      title: `Hồ sơ ${record.code} cần xác nhận phân luồng`,
      message: `AI đề xuất chuyển "${title}" đến ${service.team}.`,
      relatedCaseId: String(record._id),
      actionUrl: `/cases/${record._id}`
    }
  );

  res.status(201).json({ case: presentCase(record, req.auth!.role), similar });
});

/* ── Case Detail ── */

casesRouter.get("/cases/:id", validateObjectId("id"), async (req, res) => {
  const filter: any = { _id: req.params.id, ...caseScope(req.auth!) };
  const record = await CaseRecord.findOne(filter).lean<any>();
  if (!record) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  await logAudit({
    ...auditFromReq(req),
    action: "case.view",
    resource: "CaseRecord",
    resourceId: String(record._id),
    changes: { code: record.code }
  }, req);
  res.json({ case: presentCase(record, req.auth!.role) });
});

/* ── Update Case ── */

/* ── Incidents ── */

casesRouter.get(
  "/incidents",
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const incidents = await Incident.find({
      organizationId: req.auth!.organizationId,
      ...(req.auth!.role === "agent" ? { team: req.auth!.team } : {})
    })
      .sort({ detectedAt: -1 })
      .populate("caseIds", "code title status priority")
      .lean();
    res.json({ incidents });
  }
);

/* ── Services (read) ── */

casesRouter.get("/services", async (req, res) => {
  const includeInactive = ["org_admin", "platform_admin"].includes(req.auth!.role) && req.query.includeInactive === "true";
  const services = await ServiceDefinition.find({
    organizationId: req.auth!.organizationId,
    ...(includeInactive ? {} : { active: true })
  })
    .sort({ name: 1 })
    .lean();
  res.json({ services });
});

/* ── Users (read) ── */

casesRouter.get(
  "/users",
  requireRoles("agent", "manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const includeInactive = ["org_admin", "platform_admin"].includes(req.auth!.role) && req.query.includeInactive === "true";
    const users = await User.find({ organizationId: req.auth!.organizationId, ...(includeInactive ? {} : { active: true }) })
      .sort({ role: 1, name: 1 })
      .lean<PublicUserSource[]>();
    res.json({ users: users.map((user) => publicUser(user)) });
  }
);
