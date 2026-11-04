import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { KnowledgeArticle } from "../models.js";
import { retrieveKnowledge } from "../services/aiClient.js";
import { generationEnabled, groundedAnswer } from "../services/groundedAnswer.js";
import { auditFromReq, logAudit } from "../services/helpers.js";
import { expandKnowledgeQuery, knowledgeTerms } from "../services/knowledgeQuery.js";

export const knowledgeRouter = Router();
knowledgeRouter.get("/knowledge/:id/versions/:version", async (req, res) => {
  const id = z.string().regex(/^[a-f\d]{24}$/i).parse(req.params.id);
  const version = z.string().min(1).max(30).parse(req.params.version);
  const article = await KnowledgeArticle.findOne({ _id: id, organizationId: req.auth!.organizationId, active: true }).select("+revisions").lean<any>();
  if (!article) return res.status(404).json({ message: "Không tìm thấy tài liệu." });
  const now = new Date();
  const isEffective = (value: { effectiveAt?: Date; expiresAt?: Date | null }) => Boolean(value.effectiveAt && new Date(value.effectiveAt) <= now && (!value.expiresAt || new Date(value.expiresAt) > now));
  if (req.auth!.role === "requester" && (article.status !== "published" || !isEffective(article))) return res.status(404).json({ message: "Không tìm thấy tài liệu." });
  const snapshot = article.revisions?.find((item: { version: string }) => item.version === version);
  if (snapshot && req.auth!.role === "requester" && !isEffective(snapshot)) return res.status(404).json({ message: "Không tìm thấy phiên bản còn hiệu lực." });
  if (snapshot) return res.json({ article: { ...snapshot, _id: id, archived: true } });
  if (article.version !== version || article.status !== "published") return res.status(404).json({ message: "Không tìm thấy phiên bản." });
  const { revisions: _revisions, ...current } = article;
  res.json({ article: current });
});
knowledgeRouter.use("/knowledge/search", rateLimit({ windowMs: 60_000, limit: 10, keyGenerator: req => req.auth!.id,
  skip: req => req.body?.generate !== true, standardHeaders: "draft-7", legacyHeaders: false }));
knowledgeRouter.get("/knowledge/capabilities", (req, res) => {
  res.json({ generation: req.auth!.role !== "requester" && generationEnabled(req.auth!.organizationId) });
});

knowledgeRouter.get("/knowledge", async (req, res) => {
  const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
  const limit = z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit);
  const search = z.string().trim().max(160).default("").parse(req.query.search);
  const id = z.string().regex(/^[a-f\d]{24}$/i).optional().parse(req.query.id);
  const published = {
    status: "published",
    effectiveAt: { $lte: new Date() },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  };
  const visibility = req.auth!.role === "requester"
    ? published
    : req.auth!.role === "agent"
      ? { $or: [published, { authorId: req.auth!.id }] }
      : {};
  const filter = {
    organizationId: req.auth!.organizationId,
    active: true,
    ...visibility,
    ...(id ? { _id: id } : {}),
    ...(search ? { $text: { $search: knowledgeTerms(expandKnowledgeQuery(search)).join(" ") || search } } : {})
  };
  const [articles, total] = await Promise.all([
    KnowledgeArticle.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    KnowledgeArticle.countDocuments(filter)
  ]);
  res.json({ articles, total, page, limit });
});

knowledgeRouter.post("/knowledge/search", async (req, res) => {
  const input = z.object({ query: z.string().trim().min(3).max(1_000), generate: z.boolean().default(false) }).parse(req.body);
  const query = expandKnowledgeQuery(input.query);
  const MAX_ARTICLES = 50;
  const baseFilter = {
    organizationId: req.auth!.organizationId,
    active: true,
    status: "published",
    effectiveAt: { $lte: new Date() },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
  };
  // Pre-filter with MongoDB text search to avoid sending the entire knowledge base
  let articles = await KnowledgeArticle.find(
    { ...baseFilter, $text: { $search: knowledgeTerms(query).join(" ") || query } },
    { score: { $meta: "textScore" } }
  )
    .sort({ score: { $meta: "textScore" } })
    .limit(MAX_ARTICLES)
    .lean();
  if (articles.length === 0) {
    // Fallback: no text-search hits → most recent articles
    articles = await KnowledgeArticle.find(baseFilter)
      .sort({ updatedAt: -1 })
      .limit(MAX_ARTICLES)
      .lean();
  }
  const retrieved = await retrieveKnowledge(
    query,
    articles.map((article: any) => ({
      id: String(article._id),
      title: article.title,
      content: article.content,
      category: article.category,
      sourceLabel: article.sourceLabel
    }))
  );
  const result = { ...retrieved, citations: retrieved.citations.map(citation => ({ ...citation,
    version: articles.find(article => String(article._id) === citation.id)?.version })) };
  if (input.generate && req.auth!.role !== "requester") {
    const response = await groundedAnswer(req.auth!.organizationId, input.query, result);
    await logAudit({ ...auditFromReq(req), action: "knowledge.draft", resource: "KnowledgeArticle",
      changes: { mode: response.generation.mode, sourceIds: response.citations.map((citation) => citation.id), requestId: req.requestId } }, req);
    res.json(response);
    return;
  }
  res.json({ ...result, generation: { mode: "retrieval" } });
});
