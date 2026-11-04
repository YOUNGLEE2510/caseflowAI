import { Router } from "express";
import mongoose from "mongoose";
import { config } from "../config.js";
import { requireRoles } from "../middleware/auth.js";
import { Attachment, CaseRecord, KnowledgeArticle, User } from "../models.js";
import { z } from "zod";
import { HttpError } from "../middleware/error.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const systemRouter = Router();
systemRouter.use(requireRoles("manager", "org_admin", "platform_admin"));
systemRouter.get("/jobs", async (req, res) => {
  const records = await CaseRecord.find({ organizationId: req.auth!.organizationId, $or: [
    { "ai.processingStatus": "failed", "ai.reviewStatus": "pending" },
    { deliveryEvents: { $elemMatch: { completedAt: null, attempts: { $gte: 10 } } } },
    { "attachmentReservations.expiresAt": { $lte: new Date() } }
  ] }).select("code title ai.processingStatus ai.reviewStatus deliveryEvents.attempts deliveryEvents.completedAt updatedAt +attachmentReservations").sort({ updatedAt: -1 }).limit(50).lean();
  res.json({ jobs: records.flatMap(record => [
    ...(record.ai?.processingStatus === "failed" && record.ai?.reviewStatus === "pending" ? [{ caseId: String(record._id), code: record.code, kind: "triage" }] : []),
    ...(record.deliveryEvents?.some((event: { completedAt?: Date; attempts: number }) => !event.completedAt && event.attempts >= 10) ? [{ caseId: String(record._id), code: record.code, kind: "delivery" }] : []),
    ...(record.attachmentReservations?.some((entry: { expiresAt: Date }) => entry.expiresAt <= new Date()) ? [{ caseId: String(record._id), code: record.code, kind: "upload" }] : [])
  ]) });
});
systemRouter.post("/jobs/:id/retry", async (req, res) => {
  const id = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id);
  const { kind } = z.object({ kind: z.enum(["triage", "delivery", "upload"]) }).strict().parse(req.body);
  const scope = { _id: id, organizationId: req.auth!.organizationId };
  const result = kind === "triage"
    ? await CaseRecord.updateOne({ ...scope, "ai.processingStatus": "failed", "ai.reviewStatus": "pending" }, { $set: { "ai.processingStatus": "queued", "ai.processingStartedAt": null }, $inc: { __v: 1 } })
    : kind === "upload"
      ? await CaseRecord.updateOne({ ...scope, "attachmentReservations.expiresAt": { $lte: new Date() } }, { $set: { "attachmentReservations.$[entry].expiresAt": new Date(0) } }, { arrayFilters: [{ "entry.expiresAt": { $lte: new Date() } }] })
      : await CaseRecord.updateOne({ ...scope, deliveryEvents: { $elemMatch: { completedAt: null, attempts: { $gte: 10 } } } }, { $set: { "deliveryEvents.$[event].attempts": 0, "deliveryEvents.$[event].lockedUntil": null } }, { arrayFilters: [{ "event.completedAt": null, "event.attempts": { $gte: 10 } }] });
  if (!result.modifiedCount) throw new HttpError(409, "Tác vụ đã thay đổi hoặc không thuộc tổ chức.");
  await logAudit({ ...auditFromReq(req), action: "system.job_retry", resource: "CaseRecord", resourceId: id, changes: { kind } }, req);
  res.json({ queued: true });
});
systemRouter.get("/status", async (req, res) => {
  const scope = { organizationId: req.auth!.organizationId };
  const [ai, overdueCases, unassignedCases, draftArticles, users, storage] = await Promise.all([
    fetch(`${config.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) }).then(async (response) => {
      if (!response.ok) throw new Error("AI unavailable");
      const value = await response.json() as Record<string, unknown>;
      return { connected: true, classifier: value.classifier, modelVersion: value.modelVersion, trainingSamples: value.trainingSamples, categories: value.categories };
    }).catch(() => ({ connected: false })),
    CaseRecord.countDocuments({ ...scope, status: { $nin: ["resolved", "closed", "waiting"] }, dueAt: { $lt: new Date() } }),
    CaseRecord.countDocuments({ ...scope, status: { $nin: ["resolved", "closed"] }, assigneeId: null }),
    KnowledgeArticle.countDocuments({ ...scope, active: true, status: { $ne: "published" } }),
    User.countDocuments({ ...scope, active: true }),
    Attachment.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId) } }, { $group: { _id: null, bytes: { $sum: "$size" }, files: { $sum: 1 } } }])
  ]);
  res.json({ database: { engine: "MongoDB", connected: mongoose.connection.readyState === 1 }, ai, storage: { provider: config.STORAGE_PROVIDER, bytes: storage[0]?.bytes || 0, files: storage[0]?.files || 0 }, malwareScanner: { mode: config.MALWARE_SCAN_MODE }, counts: { overdueCases, unassignedCases, draftArticles, activeUsers: users }, checkedAt: new Date().toISOString() });
});
