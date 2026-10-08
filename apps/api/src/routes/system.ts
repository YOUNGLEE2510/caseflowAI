import { Router } from "express";
import mongoose from "mongoose";
import { config } from "../config.js";
import { requireRoles } from "../middleware/auth.js";
import { Attachment, CaseRecord, KnowledgeArticle, User } from "../models.js";

export const systemRouter = Router();
systemRouter.use(requireRoles("manager", "org_admin", "platform_admin"));
systemRouter.get("/status", async (req, res) => {
  const scope = { organizationId: req.auth!.organizationId };
  const [ai, overdueCases, unassignedCases, draftArticles, users, storage] = await Promise.all([
    fetch(`${config.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) }).then(async (response) => {
      if (!response.ok) throw new Error("AI unavailable");
      const value = await response.json() as Record<string, unknown>;
      return { connected: true, classifier: value.classifier, modelVersion: value.modelVersion, trainingSamples: value.trainingSamples, categories: value.categories };
    }).catch(() => ({ connected: false })),
    CaseRecord.countDocuments({ ...scope, status: { $nin: ["resolved", "closed"] }, dueAt: { $lt: new Date() } }),
    CaseRecord.countDocuments({ ...scope, status: { $nin: ["resolved", "closed"] }, assigneeId: null }),
    KnowledgeArticle.countDocuments({ ...scope, active: true, status: { $ne: "published" } }),
    User.countDocuments({ ...scope, active: true }),
    Attachment.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId) } }, { $group: { _id: null, bytes: { $sum: "$size" }, files: { $sum: 1 } } }])
  ]);
  res.json({ database: { engine: "MongoDB", connected: mongoose.connection.readyState === 1 }, ai, storage: { provider: config.STORAGE_PROVIDER, bytes: storage[0]?.bytes || 0, files: storage[0]?.files || 0 }, malwareScanner: { mode: config.MALWARE_SCAN_MODE }, counts: { overdueCases, unassignedCases, draftArticles, activeUsers: users }, checkedAt: new Date().toISOString() });
});
