import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { validateObjectId } from "../middleware/validateId.js";
import { CaseRecord, Incident, User } from "../models.js";
import { INCIDENT_STATUSES, SEVERITY_LEVELS } from "../models/constants.js";
import { findRelatedCases } from "../services/aiClient.js";
import { auditFromReq, logAudit, notifyMany } from "../services/helpers.js";
import { hiddenShapes, requireAiVisible } from "../services/aiVisibility.js";

export const incidentActions = Router();
const manage = requireRoles("manager", "org_admin", "platform_admin");
const code = z.string().trim().regex(/^[a-z\d-]{1,64}$/i).transform(value => value.toUpperCase());
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const openCase = { status: { $nin: ["closed", "resolved"] }, mergedIntoId: null };

incidentActions.get("/cases/:id/related", manage, validateObjectId("id"), requireAiVisible(hiddenShapes.related), async (req, res) => {
  const source = await CaseRecord.findOne({ organizationId: req.auth!.organizationId, _id: req.params.id }).lean<any>();
  if (!source) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  if (!source.propertyCode || ["closed", "resolved"].includes(source.status)) { res.json({ matches: [] }); return; }
  const candidates = await CaseRecord.find({ organizationId: req.auth!.organizationId, propertyCode: source.propertyCode,
    _id: { $ne: source._id }, ...openCase,
    createdAt: { $gte: new Date(source.createdAt.getTime() - 48 * 3600_000), $lte: new Date(source.createdAt.getTime() + 48 * 3600_000) }
  }).select("code title description propertyCode unitCode assetCode createdAt").sort({ createdAt: -1 }).limit(100).lean();
  const asInput = (item: typeof source) => ({ id: String(item._id), title: item.title,
    text: `${item.title}. ${item.description}`, propertyCode: item.propertyCode, unitCode: item.unitCode || "",
    assetCode: item.assetCode || "", createdAt: item.createdAt });
  const matches = await findRelatedCases(asInput(source), candidates.map(asInput));
  res.json({ matches: matches.map(match => ({ ...match, code: candidates.find(item => String(item._id) === match.id)?.code })) });
});
const createInput = z.object({ caseCode: code, title: z.string().trim().min(3).max(160) }).strict();
const updateInput = z.object({
  version: z.number().int().min(0),
  ownerId: objectId.nullable(),
  appointmentAt: z.string().datetime().nullable(),
  severity: z.enum(SEVERITY_LEVELS),
  status: z.enum(INCIDENT_STATUSES),
  resolution: z.string().trim().max(2000),
  rootCause: z.string().trim().max(2000).default("")
}).strict();

async function noDuplicate<T>(write: () => Promise<T>) {
  try {
    return await write();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      throw new HttpError(409, "Hồ sơ đã thuộc một sự cố đang mở.");
    }
    throw error;
  }
}

async function managedIncident(organizationId: string, id: string) {
  const incident = await Incident.findOne({ _id: id, organizationId, propertyCode: { $type: "string" } }).lean<{
    _id: Types.ObjectId;
    __v: number;
    title: string;
    propertyCode: string;
    team: string;
    status: typeof INCIDENT_STATUSES[number];
    detectedAt: Date;
    appointmentAt: Date | null;
    ownerId: Types.ObjectId | null;
    caseIds: Types.ObjectId[];
  }>();
  if (!incident) throw new HttpError(404, "Không tìm thấy sự cố có thể điều phối.");
  return incident;
}

incidentActions.post("/incidents", manage, async (req, res) => {
  const { caseCode, title } = createInput.parse(req.body);
  const actor = auditFromReq(req);
  const source = await CaseRecord.findOne({ organizationId: actor.organizationId, code: caseCode, ...openCase })
    .select("propertyCode team");
  if (!source) throw new HttpError(404, "Không tìm thấy hồ sơ đang mở.");
  if (!source.propertyCode) throw new HttpError(422, "Hồ sơ cần có mã cơ sở.");
  const incident = await noDuplicate(() => Incident.create({
    organizationId: actor.organizationId, code: `INC-${randomUUID().toUpperCase()}`,
    title, propertyCode: source.propertyCode, team: source.team, caseIds: [source._id],
    responseTimeline: [{ type: "created", label: "Đã tạo sự cố", actorName: actor.actorName }]
  }));
  await logAudit({ ...actor, action: "incident.create", resource: "Incident", resourceId: String(incident._id) }, req);
  res.status(201).json({ id: incident._id });
});

incidentActions.get("/incidents/:id/options", manage, validateObjectId("id"), async (req, res) => {
  const { organizationId } = req.auth!;
  const incident = await managedIncident(organizationId, String(req.params.id));
  const [owners, linked, candidates] = await Promise.all([
    User.find({ organizationId, active: true, role: "agent", team: incident.team }).select("name").sort({ name: 1 }).limit(100).lean(),
    CaseRecord.find({ organizationId, _id: { $in: incident.caseIds }, propertyCode: incident.propertyCode })
      .select("title description propertyCode unitCode assetCode createdAt").limit(10).lean(),
    incident.status === "resolved" ? [] : CaseRecord.find({
      organizationId, propertyCode: incident.propertyCode, ...openCase, _id: { $nin: incident.caseIds },
      createdAt: { $gte: new Date(incident.detectedAt.getTime() - 48 * 3600_000),
        $lte: new Date(incident.detectedAt.getTime() + 48 * 3600_000) }
    }).select("code title description propertyCode unitCode assetCode createdAt").sort({ createdAt: -1 }).limit(40).lean()
  ]);
  const first = linked[0];
  const matches = await findRelatedCases(
    { id: first ? String(first._id) : String(incident._id), title: first?.title || incident.title,
      text: first ? `${first.title}. ${first.description}` : incident.title, propertyCode: incident.propertyCode,
      unitCode: first?.unitCode || "", assetCode: first?.assetCode || "", createdAt: first?.createdAt || incident.detectedAt },
    candidates.map(item => ({ id: String(item._id), title: item.title, text: `${item.title}. ${item.description}`,
      propertyCode: item.propertyCode, unitCode: item.unitCode || "", assetCode: item.assetCode || "", createdAt: item.createdAt }))
  );
  const scores = new Map(matches.map(item => [item.id, item.score]));
  res.json({ owners, candidates: candidates.map(({ _id, code, title, unitCode }) => ({
    _id, code, title, unitCode, score: scores.get(String(_id)) ?? null
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)) });
});

incidentActions.put("/incidents/:id/cases", manage, validateObjectId("id"), async (req, res) => {
  const { caseCode, linked } = z.object({ caseCode: code, linked: z.boolean() }).strict().parse(req.body);
  const actor = auditFromReq(req);
  const incident = await managedIncident(actor.organizationId, String(req.params.id));
  const target = await CaseRecord.findOne({
    organizationId: actor.organizationId, propertyCode: incident.propertyCode, code: caseCode, ...(linked ? openCase : {})
  }).select("_id");
  if (!target) throw new HttpError(404, "Không tìm thấy hồ sơ phù hợp tại cơ sở này.");
  const present = incident.caseIds.some(id => id.equals(target._id));
  if (present === linked) { res.status(204).end(); return; }
  if (incident.status === "resolved") throw new HttpError(409, "Sự cố đã giải quyết.");
  if (linked && incident.caseIds.length >= 100) throw new HttpError(422, "Sự cố đã đạt giới hạn 100 hồ sơ.");
  if (!linked && incident.caseIds.length === 1) throw new HttpError(422, "Sự cố phải giữ ít nhất một hồ sơ.");
  const updated = await noDuplicate(() => Incident.updateOne(
    { _id: incident._id, organizationId: actor.organizationId, __v: incident.__v, status: { $ne: "resolved" } },
    { ...(linked ? { $addToSet: { caseIds: target._id } } : { $pull: { caseIds: target._id } }),
      $inc: { __v: 1 }, $push: { responseTimeline: { type: linked ? "linked" : "unlinked",
        label: linked ? "Đã liên kết hồ sơ" : "Đã gỡ liên kết hồ sơ", actorName: actor.actorName } } }
  ));
  if (!updated.modifiedCount) throw new HttpError(409, "Sự cố đã thay đổi. Vui lòng tải lại.");
  await logAudit({ ...actor, action: linked ? "incident.link" : "incident.unlink", resource: "Incident",
    resourceId: String(incident._id), changes: { caseId: String(target._id) } }, req);
  res.status(204).end();
});

incidentActions.patch("/incidents/:id", manage, validateObjectId("id"), async (req, res) => {
  const input = updateInput.parse(req.body);
  const actor = auditFromReq(req);
  const incident = await managedIncident(actor.organizationId, String(req.params.id));
  if (incident.status === "resolved" || incident.__v !== input.version) {
    throw new HttpError(409, "Sự cố đã thay đổi hoặc đã giải quyết. Vui lòng tải lại.");
  }
  if (input.status === "resolved" && !input.resolution) throw new HttpError(422, "Cần ghi kết quả xử lý.");
  const owner = input.ownerId ? await User.findOne({ _id: input.ownerId, organizationId: actor.organizationId,
    active: true, role: "agent", team: incident.team }).select("name") : null;
  if (input.ownerId && !owner) throw new HttpError(422, "Người phụ trách không hợp lệ.");
  const appointmentAt = input.appointmentAt ? new Date(input.appointmentAt) : null;
  const changed = incident.status !== input.status || (incident.appointmentAt?.getTime() ?? null) !== (appointmentAt?.getTime() ?? null);
  const updated = await Incident.updateOne({ _id: incident._id, organizationId: actor.organizationId, __v: input.version }, {
    $set: { ownerId: owner?._id ?? null, ownerName: owner?.name ?? "", appointmentAt, status: input.status,
      severity: input.severity, rootCause: input.rootCause, resolution: input.resolution, resolvedAt: input.status === "resolved" ? new Date() : null },
    $inc: { __v: 1 },
    $push: { responseTimeline: { type: "updated", label: "Đã cập nhật điều phối", actorName: actor.actorName } }
  });
  if (!updated.modifiedCount) throw new HttpError(409, "Sự cố đã thay đổi. Vui lòng tải lại.");
  await logAudit({ ...actor, action: "incident.update", resource: "Incident", resourceId: String(incident._id),
    changes: { status: input.status, ownerId: input.ownerId, appointmentAt: input.appointmentAt } }, req);
  if (owner && (String(incident.ownerId) !== String(owner._id) || changed)) {
    await notifyMany([String(owner._id)], {
      organizationId: actor.organizationId, type: "incident_detected",
      title: "Đã cập nhật sự cố được giao", message: incident.title, actionUrl: "/incidents"
    });
  }
  if (changed) {
    const records = await CaseRecord.find({ organizationId: actor.organizationId, propertyCode: incident.propertyCode,
      _id: { $in: incident.caseIds } }).select("requesterId").lean();
    await notifyMany([...new Set(records.map(record => String(record.requesterId)))], {
      organizationId: actor.organizationId, type: "case_updated",
      title: input.status === "resolved" ? "Sự cố chung đã được xử lý" : "Đã cập nhật tiến độ sự cố",
      message: input.status === "resolved" ? "Nếu căn của bạn vẫn còn lỗi, vui lòng phản hồi trên hồ sơ của mình."
        : appointmentAt ? `Lịch sửa chữa: ${appointmentAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}.`
          : "Vui lòng theo dõi hồ sơ của bạn để được hỗ trợ.",
      actionUrl: "/cases"
    });
  }
  res.status(204).end();
});
