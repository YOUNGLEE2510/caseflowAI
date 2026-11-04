import mongoose from "mongoose";

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  caseId: { type: mongoose.Schema.Types.ObjectId, default: null },
  fingerprint: String,
  scope: { type: String, enum: ["case", "overview"], default: "case" },
  items: [{ action: String, reason: String, content: String, caseId: mongoose.Schema.Types.ObjectId,
    decisionReason: { type: String, enum: ["incorrect", "not_applicable", "already_done", "unspecified"] },
    decision: { type: String, enum: ["pending", "accepted", "dismissed"], default: "pending" }, decidedAt: Date }],
  citations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  engineVersion: { type: String, default: "rules-rag-v1" }, generationMode: String,
  expiresAt: { type: Date, required: true },
  purgeAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000) }
}, { timestamps: true });
schema.index({ organizationId: 1, userId: 1, createdAt: -1 });
schema.index({ caseId: 1 });
schema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
schema.index({ organizationId: 1, userId: 1, fingerprint: 1 }, { unique: true, partialFilterExpression: { fingerprint: { $type: "string" } } });
export const Recommendation = mongoose.models.Recommendation || mongoose.model("Recommendation", schema);

const feedbackSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recommendationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: String, decision: String, decisionReason: String, engineVersion: String, decidedAt: Date
}, { timestamps: true });
feedbackSchema.index({ recommendationId: 1, itemId: 1 }, { unique: true });
feedbackSchema.index({ organizationId: 1, decidedAt: -1 });
export const RecommendationFeedback = mongoose.models.RecommendationFeedback || mongoose.model("RecommendationFeedback", feedbackSchema);

export async function preserveRecommendationHistory() {
  await Recommendation.init();
  const indexes = await Recommendation.collection.indexes();
  for (const index of indexes) {
    if (index.key.expiresAt === 1 && Object.keys(index.key).length === 1 && index.expireAfterSeconds === 0 && index.name) {
      try { await Recommendation.collection.dropIndex(index.name); }
      catch (error) { if ((error as { code?: number }).code !== 27) throw error; }
    }
  }
}
