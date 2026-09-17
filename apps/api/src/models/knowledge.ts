import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const knowledgeArticleSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, required: true },
    tags: [{ type: String }],
    sourceLabel: { type: String, required: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    reviewedByName: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    sourceUrl: { type: String, default: "" },
    version: { type: String, default: "1.0" },
    effectiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    viewCount: { type: Number, default: 0 },
    helpfulCount: { type: Number, default: 0 },
    authorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, default: "" },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);
knowledgeArticleSchema.index({ organizationId: 1, active: 1, category: 1 });
knowledgeArticleSchema.index({ title: "text", content: "text" });

export const KnowledgeArticle = models.KnowledgeArticle || model("KnowledgeArticle", knowledgeArticleSchema);
