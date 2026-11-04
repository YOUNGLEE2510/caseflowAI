import { Router } from "express";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { Recommendation, RecommendationFeedback, preserveRecommendationHistory } from "../models/recommendation.js";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { CaseRecord, KnowledgeArticle, ServiceDefinition } from "../models.js";
import { caseScope } from "../services/casePolicy.js";
import { HttpError } from "../middleware/error.js";
import { retrieveKnowledge } from "../services/aiClient.js";
import { groundedAnswer } from "../services/groundedAnswer.js";
import { expandKnowledgeQuery, knowledgeTerms } from "../services/knowledgeQuery.js";
import { nextStep, isRecommendationManager, categoryResolver } from "../services/recommendations.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let retentionReady: Promise<void> | undefined;
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
interface RecommendationCase {
  _id: mongoose.Types.ObjectId; title: string; description: string; serviceKey: string;
  customFields: Record<string, string> | Map<string, string>; status: string;
  assigneeId?: mongoose.Types.ObjectId; ai?: { reviewStatus?: string };
}
export const recommendationsRouter = Router();
recommendationsRouter.use("/recommendations", rateLimit({ windowMs: 60_000, limit: 15,
  keyGenerator: req => req.auth!.id, standardHeaders: "draft-7", legacyHeaders: false }));
recommendationsRouter.use("/recommendations", async (_req, _res, next) => {
  retentionReady ??= preserveRecommendationHistory().catch(error => { retentionReady = undefined; throw error; });
  await retentionReady;
  next();
});

recommendationsRouter.get("/recommendations/metrics", async (req, res) => {
  if (!isRecommendationManager(req.auth!.role)) throw new HttpError(403, "Chỉ quản lý được xem thống kê khuyến nghị.");
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await Recommendation.aggregate<{ _id: string; total: number; accepted: number; dismissed: number }>([
    { $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), createdAt: { $gte: since } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.action", total: { $sum: 1 },
      accepted: { $sum: { $cond: [{ $eq: ["$items.decision", "accepted"] }, 1, 0] } },
      dismissed: { $sum: { $cond: [{ $eq: ["$items.decision", "dismissed"] }, 1, 0] } } } }, { $sort: { _id: 1 } }
  ]);
  const feedback = await RecommendationFeedback.aggregate<{ _id: string; accepted: number; dismissed: number }>([
    { $match: { organizationId: new mongoose.Types.ObjectId(req.auth!.organizationId), decidedAt: { $gte: since } } },
    { $group: { _id: "$action", accepted: { $sum: { $cond: [{ $eq: ["$decision", "accepted"] }, 1, 0] } },
      dismissed: { $sum: { $cond: [{ $eq: ["$decision", "dismissed"] }, 1, 0] } } } }
  ]);
  const accepted = feedback.reduce((sum, row) => sum + row.accepted, 0);
  const dismissed = feedback.reduce((sum, row) => sum + row.dismissed, 0);
  const reviewed = accepted + dismissed;
  const pending = rows.reduce((sum, row) => sum + Math.max(0, row.total - row.accepted - row.dismissed), 0);
  const total = reviewed + pending;
  const byAction = [...new Set([...rows.map(row => row._id), ...feedback.map(row => row._id)])].sort().map(action => {
    const source = rows.find(row => row._id === action);
    const decisions = feedback.find(row => row._id === action);
    const accepted = decisions?.accepted || 0, dismissed = decisions?.dismissed || 0;
    const pending = source ? Math.max(0, source.total - source.accepted - source.dismissed) : 0;
    return { _id: action, total: pending + accepted + dismissed, accepted, dismissed, pending };
  });
  res.json({ days: 30, total, reviewed, accepted, dismissed, pending: total - reviewed,
    acceptanceRate: reviewed ? accepted / reviewed : null, byAction });
});

recommendationsRouter.get("/recommendations/feedback-history", async (req, res) => {
  if (!isRecommendationManager(req.auth!.role)) throw new HttpError(403, "Chỉ quản lý được xem lịch sử đánh giá.");
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
  const filter = { organizationId: req.auth!.organizationId };
  const [items, total] = await Promise.all([
    RecommendationFeedback.find(filter).select("action decision decisionReason engineVersion decidedAt").sort({ decidedAt: -1, _id: -1 }).skip((page - 1) * 50).limit(50).lean(),
    RecommendationFeedback.countDocuments(filter)
  ]);
  res.json({ items, total, page, limit: 50 });
});

recommendationsRouter.post("/recommendations/overview", async (req, res) => {
  z.object({}).strict().parse(req.body);
  const auth = req.auth!;
  if (!isRecommendationManager(auth.role)) throw new HttpError(403, "Chỉ quản lý được xem khuyến nghị tổng hợp.");
  const now = new Date();
  const organizationId = new mongoose.Types.ObjectId(auth.organizationId);
  const openFilter = { organizationId, status: { $nin: ["resolved", "closed", "waiting"] } };
  const cases = await CaseRecord.find({ ...openFilter, $or: [{ assigneeId: null }, { dueAt: { $lt: now } }, { "ai.riskScore": { $gte: 0.65 } }] })
    .select("_id code dueAt assigneeId ai.riskScore").sort({ dueAt: 1, _id: 1 }).limit(8)
    .lean<Array<{ _id: mongoose.Types.ObjectId; code: string; dueAt: Date; assigneeId?: mongoose.Types.ObjectId; ai?: { riskScore?: number } }>>();
  const items: Array<{ caseId?: mongoose.Types.ObjectId; action: string; reason: string }> = cases.map(record => ({ caseId: record._id,
    action: !record.assigneeId ? "assign" : "review_sla",
    reason: `${record.code}: ${record.dueAt < now ? "đã quá hạn SLA" : !record.assigneeId ? "chưa có người phụ trách" : "điểm rủi ro mô phỏng cao, cần kiểm tra thực tế"}. ${!record.assigneeId ? "Xem tải công việc trước khi phân công." : "Kiểm tra nguyên nhân chậm và cân nhắc điều phối lại."}` }));
  const [topics, covered] = await Promise.all([
    CaseRecord.aggregate<{ _id: string; count: number }>([{ $match: { organizationId, createdAt: { $gte: new Date(now.getTime() - 30 * 86400000) } } },
      { $group: { _id: "$category", count: { $sum: 1 } } }]),
    KnowledgeArticle.distinct("category", { organizationId, active: true, status: "published", effectiveAt: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] })
  ]);
  const services = await ServiceDefinition.find({ organizationId }).select("key name category").lean<Array<{ key: string; name: string; category: string }>>();
  const resolveCategory = categoryResolver(services);
  const coveredKeys = new Set(covered.map(value => resolveCategory(String(value))).filter(Boolean));
  const normalizedTopics = new Map<string, number>();
  for (const topic of topics) {
    const key = resolveCategory(topic._id || "");
    if (key) normalizedTopics.set(key, (normalizedTopics.get(key) || 0) + topic.count);
  }
  for (const [category, count] of [...normalizedTopics].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6)) if (!coveredKeys.has(category)) items.push({ action: "knowledge_gap",
    reason: `Nhóm ${services.find(service => service.key === category)?.name || category} có ${count} hồ sơ trong 30 ngày nhưng chưa có bài tri thức còn hiệu lực trong nhóm. Cân nhắc soạn hướng dẫn; đây là tín hiệu theo danh mục, chưa phải kết luận thiếu nội dung.` });
  if (!items.length) items.push({ action: "monitor", reason: "Chưa phát hiện hồ sơ cần ưu tiên theo các quy tắc hiện tại. Tiếp tục theo dõi hàng đợi." });
  const key = fingerprint(["overview", auth.role, items, Math.floor(now.getTime() / 900000)]);
  const recommendation = await Recommendation.findOneAndUpdate({ organizationId, userId: auth.id, fingerprint: key },
    { $setOnInsert: { scope: "overview", items, generationMode: "operational_rules", expiresAt: new Date(now.getTime() + 900000) } }, { upsert: true, new: true });
  await logAudit({ ...auditFromReq(req), action: "recommendation.overview", resource: "Recommendation", resourceId: String(recommendation._id), changes: { count: items.length } }, req);
  res.json({ recommendation });
});

recommendationsRouter.post("/recommendations", async (req, res) => {
  const input = z.object({ caseId: objectId.optional(), text: z.string().trim().min(12).max(5000).optional(),
    serviceKey: z.string().max(100).optional(), customFields: z.record(z.string(), z.string().max(2000)).default({}) }).strict().parse(req.body);
  const auth = req.auth!;
  const record = input.caseId ? await CaseRecord.findOne({ ...caseScope(auth), _id: input.caseId }).lean<RecommendationCase>() : null;
  if (input.caseId && !record) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  const text = record ? `${record.title}. ${record.description}` : input.text;
  if (!text) throw new HttpError(422, "Cần nội dung yêu cầu.");
  const service = await ServiceDefinition.findOne({ organizationId: auth.organizationId,
    key: record?.serviceKey || input.serviceKey || "", active: true }).lean<{ requiredFields: string[] }>();
  const fields = record?.customFields instanceof Map ? Object.fromEntries(record.customFields) : record?.customFields || input.customFields;
  const missingFields = ((service?.requiredFields || []) as string[]).filter(key => !String(fields[key] || "").trim());
  const query = expandKnowledgeQuery(text.slice(0, 1000));
  const filter = { organizationId: auth.organizationId, active: true, status: "published",
    effectiveAt: { $lte: new Date() }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] };
  let articles = await KnowledgeArticle.find({ ...filter, $text: { $search: knowledgeTerms(query).join(" ") || query } })
    .limit(50).lean();
  if (!articles.length) articles = await KnowledgeArticle.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
  const retrieval = await retrieveKnowledge(query, articles.map(article => ({ id: String(article._id), title: article.title,
    content: article.content, category: article.category, sourceLabel: article.sourceLabel })));
  const citations = retrieval.citations.filter(citation => articles.some(article => String(article._id) === citation.id))
    .map(citation => { const source = articles.find(article => String(article._id) === citation.id)!;
      return { ...citation, version: source.version, effectiveAt: source.effectiveAt }; });
  const key = fingerprint([auth.role, record || null, text, input.serviceKey, Object.entries(input.customFields).sort(),
    articles.map(article => [String(article._id), article.updatedAt]).sort(), Math.floor(Date.now() / 900000)]);
  const cached = await Recommendation.findOne({ organizationId: auth.organizationId, userId: auth.id, fingerprint: key, expiresAt: { $gt: new Date() } });
  if (cached) { res.json({ recommendation: cached }); return; }
  const staff = auth.role !== "requester";
  const items: Array<{ action: string; reason: string; content?: string }> = [];
  if (missingFields.length && !staff) items.push({ action: "complete_information", reason: `Dịch vụ yêu cầu bổ sung: ${missingFields.join(", ")}.` });
  if (staff && record) { const step = nextStep({ status: record.status, assigneeId: record.assigneeId,
    reviewStatus: record.ai?.reviewStatus, missingFields }); if (step) items.push(step); }
  if (citations.length) items.push({ action: "read_guidance", reason: "Có tài liệu liên quan đã xuất bản. Kiểm tra phạm vi áp dụng trước khi sử dụng." });
  else items.push({ action: "seek_support", reason: "Chưa tìm thấy tài liệu phù hợp; cần người phụ trách xác minh, không suy diễn quy định." });
  let generationMode = "retrieval";
  if (staff && record && !["resolved", "closed"].includes(record.status) && citations.length) {
    const draft = await groundedAnswer(auth.organizationId, text.slice(0, 5000), { ...retrieval, citations });
    generationMode = draft.generation.mode;
    if (generationMode === "generated") items.push({ action: "draft_reply", reason: "Bản nháp dựa trên trích dẫn, cần nhân viên kiểm tra trước khi gửi.", content: draft.answer });
  }
  const recommendation = await Recommendation.findOneAndUpdate({ organizationId: auth.organizationId, userId: auth.id, fingerprint: key },
    { $setOnInsert: { caseId: record?._id, items, citations, generationMode, expiresAt: new Date(Date.now() + 900000) } }, { new: true, upsert: true });
  await logAudit({ ...auditFromReq(req), action: "recommendation.created", resource: "Recommendation",
    resourceId: String(recommendation._id), changes: { engineVersion: "rules-rag-v1", count: items.length } }, req);
  res.json({ recommendation });
});

recommendationsRouter.patch("/recommendations/:id/items/:itemId", async (req, res) => {
  const id = objectId.parse(req.params.id), itemId = objectId.parse(req.params.itemId);
  const { decision, reason } = z.object({ decision: z.enum(["accepted", "dismissed"]), reason: z.enum(["incorrect", "not_applicable", "already_done", "unspecified"]).optional() }).strict().parse(req.body);
  const owner = { _id: id, organizationId: req.auth!.organizationId, userId: req.auth!.id, expiresAt: { $gt: new Date() } };
  const current = await Recommendation.findOne(owner).lean<{ caseId?: mongoose.Types.ObjectId; scope?: string }>();
  if (!current) throw new HttpError(404, "Không tìm thấy khuyến nghị.");
  if (current.scope === "overview" && !isRecommendationManager(req.auth!.role)) throw new HttpError(403, "Quyền quản lý không còn hiệu lực.");
  if (current.caseId && !await CaseRecord.exists({ ...caseScope(req.auth!), _id: current.caseId })) throw new HttpError(404, "Không tìm thấy hồ sơ.");
  let updated = await Recommendation.findOneAndUpdate({ ...owner, items: { $elemMatch: { _id: itemId, decision: "pending" } } },
    { $set: { "items.$.decision": decision, "items.$.decidedAt": new Date(), ...(decision === "dismissed" ? { "items.$.decisionReason": reason || "unspecified" } : {}) } }, { new: true });
  const changed = Boolean(updated);
  if (!updated) updated = await Recommendation.findOne({ ...owner, items: { $elemMatch: {
    _id: itemId, decision, ...(decision === "dismissed" ? { decisionReason: reason || "unspecified" } : {})
  } } });
  if (!updated) throw new HttpError(409, "Khuyến nghị đã được đánh giá hoặc không tồn tại.");
  const stored = updated.toObject() as { items: Array<{ _id: mongoose.Types.ObjectId; action: string; decidedAt: Date }>; engineVersion: string };
  const storedItem = stored.items.find(item => String(item._id) === itemId)!;
  await RecommendationFeedback.updateOne({ recommendationId: id, itemId }, { $setOnInsert: {
    organizationId: req.auth!.organizationId, userId: req.auth!.id, action: stored.items.find(item => String(item._id) === itemId)?.action,
    decision, decisionReason: decision === "dismissed" ? reason || "unspecified" : undefined,
    engineVersion: stored.engineVersion, decidedAt: storedItem.decidedAt
  } }, { upsert: true });
  if (changed) await logAudit({ ...auditFromReq(req), action: `recommendation.${decision}`, resource: "Recommendation", resourceId: id,
    changes: { itemId } }, req);
  res.json({ recommendation: updated });
});
