import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { KnowledgeArticle } from "../models.js";
import { retrieveKnowledge } from "../services/aiClient.js";
import { generationEnabled, groundedAnswer } from "../services/groundedAnswer.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const knowledgeRouter = Router();
knowledgeRouter.use(authenticate);
knowledgeRouter.get("/knowledge/capabilities", (req, res) => {
  res.json({ generation: req.auth!.role !== "requester" && generationEnabled(req.auth!.organizationId) });
});

knowledgeRouter.get("/knowledge", async (req, res) => {
  const articles = await KnowledgeArticle.find({
    organizationId: req.auth!.organizationId,
    active: true,
    ...(req.auth!.role === "requester"
      ? { status: "published", effectiveAt: { $lte: new Date() }, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
      : {})
  })
    .sort({ updatedAt: -1 })
    .lean();
  res.json({ articles });
});

knowledgeRouter.post("/knowledge/search", async (req, res) => {
  const input = z.object({ query: z.string().trim().min(3).max(1_000), generate: z.boolean().default(false) }).parse(req.body);
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
    { ...baseFilter, $text: { $search: input.query } },
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
  const result = await retrieveKnowledge(
    input.query,
    articles.map((article: any) => ({
      id: String(article._id),
      title: article.title,
      content: article.content,
      category: article.category,
      sourceLabel: article.sourceLabel
    }))
  );
  if (input.generate && req.auth!.role !== "requester") {
    const response = await groundedAnswer(req.auth!.organizationId, input.query, result);
    await logAudit({ ...auditFromReq(req), action: "knowledge.draft", resource: "KnowledgeArticle",
      changes: { mode: response.generation.mode, sourceIds: response.citations.map((citation) => citation.id), requestId: req.requestId } }, req);
    res.json(response);
    return;
  }
  res.json({ ...result, generation: { mode: "retrieval" } });
});
