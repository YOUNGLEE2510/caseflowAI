import { CaseRecord, ServiceDefinition } from "../models.js";
import { classifyText, findSimilarCases, predictSla } from "../services/aiClient.js";
import { withAiBudget } from "../services/aiBudget.js";

export async function processCaseTriage() {
  const record = await CaseRecord.findOneAndUpdate({ "ai.reviewStatus": "pending", $or: [
    { "ai.processingStatus": "queued" },
    { "ai.processingStatus": "running", "ai.processingStartedAt": { $lt: new Date(Date.now() - 120000) } }
  ] }, { $set: { "ai.processingStatus": "running", "ai.processingStartedAt": new Date() }, $inc: { __v: 1 } },
  { new: true, timestamps: false }).lean<any>();
  if (!record) return;
  try {
    const [service, candidates, workload] = await Promise.all([
      ServiceDefinition.findOne({ organizationId: record.organizationId, key: record.serviceKey }).select("slaHours").lean<any>(),
      CaseRecord.find({ organizationId: record.organizationId, team: record.team, _id: { $ne: record._id }, status: { $nin: ["closed", "resolved"] } })
        .select("title description").sort({ createdAt: -1 }).limit(100).lean(),
      CaseRecord.countDocuments({ organizationId: record.organizationId, team: record.team, status: { $nin: ["closed", "resolved"] } })
    ]);
    const result = await withAiBudget(10000, async () => {
      const text = `${record.title}. ${record.description}`;
      const classification = await classifyText(text);
      const similar = await findSimilarCases(text, candidates.map(item => ({ id: String(item._id), title: item.title, text: `${item.title}. ${item.description}` })));
      const sla = await predictSla({ elapsedHours: 0, dueHours: service?.slaHours || 24, transfers: 0, workload, remainingSteps: 3, priority: record.priority });
      return { classification, similar, sla };
    });
    await CaseRecord.updateOne({ _id: record._id, __v: record.__v, "ai.reviewStatus": "pending" }, { $set: {
      "ai.processingStatus": "complete", "ai.classification": result.classification.label,
      "ai.routingMismatch": result.classification.label !== record.category, "ai.confidence": result.classification.confidence,
      "ai.summary": result.classification.summary, "ai.extracted": result.classification.extracted,
      "ai.modelVersion": result.classification.modelVersion || `${result.classification.provider}-unversioned`,
      "ai.similarCaseIds": result.similar.map(item => item.id), "ai.riskScore": result.sla.riskScore,
      "ai.riskFactors": result.sla.factors, "ai.analyzedAt": new Date()
    }, $inc: { __v: 1 } });
  } catch {
    await CaseRecord.updateOne({ _id: record._id, __v: record.__v, "ai.reviewStatus": "pending" }, { $set: { "ai.processingStatus": "failed" }, $inc: { __v: 1 } });
    console.warn("[Case triage] Analysis unavailable; manual processing remains available.");
  }
}
