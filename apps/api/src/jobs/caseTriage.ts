import { CaseRecord, ServiceDefinition, Organization } from "../models.js";
import { config } from "../config.js";
import { classifyText, findSimilarCases, findRelatedCases, predictSla } from "../services/aiClient.js";
import { withAiBudget } from "../services/aiBudget.js";
import { suggestPriority } from "../services/prioritySuggestion.js";

export async function processCaseTriage(target?: { caseId: string; organizationId: string }) {
  const organizations = config.DOMAIN_PROFILE === "rental"
    ? await Organization.find({ status: "active", "settings.serviceDomain": "rental" }).select("_id").lean() : null;
  const record = await CaseRecord.findOneAndUpdate({ ...(organizations ? { organizationId: { $in: organizations.map(item => item._id) } } : {}),
    ...(target ? { _id: target.caseId, organizationId: target.organizationId } : {}),
    "ai.reviewStatus": "pending", $or: [
    { "ai.processingStatus": "queued" },
    { "ai.processingStatus": "running", "ai.processingStartedAt": { $lt: new Date(Date.now() - 120000) } }
  ] }, { $set: { "ai.processingStatus": "running", "ai.processingStartedAt": new Date() }, $inc: { __v: 1 } },
  { new: true, timestamps: false }).lean<any>();
  if (!record) return;
  try {
    const [service, candidates, workload] = await Promise.all([
      ServiceDefinition.findOne({ organizationId: record.organizationId, key: record.serviceKey }).select("slaHours").lean<any>(),
      CaseRecord.find({ organizationId: record.organizationId, team: record.team, _id: { $ne: record._id },
        mergedIntoId: null, status: { $nin: ["closed", "resolved"] },
        ...(record.propertyCode ? { propertyCode: record.propertyCode,
          createdAt: { $gte: new Date(record.createdAt.getTime() - 48 * 3600_000), $lte: new Date(record.createdAt.getTime() + 48 * 3600_000) } } : {})
      })
        .select("title description propertyCode unitCode assetCode createdAt").sort({ createdAt: -1 }).limit(100).lean(),
      CaseRecord.countDocuments({ organizationId: record.organizationId, team: record.team, status: { $nin: ["closed", "resolved"] } })
    ]);
    const result = await withAiBudget(10000, async () => {
      const text = `${record.title}. ${record.description}`;
      const classification = await classifyText(text);
      const similar = record.propertyCode ? await findRelatedCases({
        id: String(record._id), title: record.title, text, propertyCode: record.propertyCode,
        unitCode: record.unitCode || "", assetCode: record.assetCode || "", createdAt: record.createdAt
      }, candidates.map(item => ({ id: String(item._id), title: item.title, text: `${item.title}. ${item.description}`,
        propertyCode: item.propertyCode, unitCode: item.unitCode || "", assetCode: item.assetCode || "", createdAt: item.createdAt })))
        : await findSimilarCases(text, candidates.map(item => ({ id: String(item._id), title: item.title, text: `${item.title}. ${item.description}` })));
      const sla = await predictSla({ elapsedHours: 0, dueHours: service?.slaHours || 24, transfers: 0, workload, remainingSteps: 3, priority: record.priority });
      return { classification, similar, sla };
    });
    const priority = suggestPriority({ text: `${record.title}. ${record.description}`, category: result.classification.label, relatedOpenCases: result.similar.length });
    const analyzed = await CaseRecord.updateOne({ _id: record._id, __v: record.__v, "ai.reviewStatus": "pending" }, { $set: {
      "ai.processingStatus": "complete", "ai.classification": result.classification.label,
      "ai.routingMismatch": result.classification.label !== record.category, "ai.confidence": result.classification.confidence,
      "ai.summary": result.classification.summary, "ai.extracted": result.classification.extracted,
      "ai.modelVersion": result.classification.modelVersion || `${result.classification.provider}-unversioned`,
      "ai.similarCaseIds": result.similar.map(item => item.id), "ai.riskScore": result.sla.riskScore,
      "ai.riskFactors": result.sla.factors, "ai.suggestedPriority": priority.priority, "ai.priorityReasons": priority.reasons,
      "ai.analyzedAt": new Date()
    }, $inc: { __v: 1 } });
    if (analyzed.modifiedCount && record.propertyCode && result.similar.length) {
      const relatedIds = new Set(result.similar.map(item => item.id));
      const ids = candidates.filter(item => relatedIds.has(String(item._id))).map(item => item._id);
      if (ids.length) {
        // A derived hint must not invalidate concurrent human review.
        await CaseRecord.updateMany({
          organizationId: record.organizationId, propertyCode: record.propertyCode, team: record.team,
          _id: { $in: [record._id, ...ids] }, mergedIntoId: null, status: { $nin: ["closed", "resolved"] }
        }, { $set: { "ai.sharedIncidentCandidate": true } }, { timestamps: false });
      }
    }
  } catch {
    await CaseRecord.updateOne({ _id: record._id, __v: record.__v, "ai.reviewStatus": "pending" }, { $set: { "ai.processingStatus": "failed" }, $inc: { __v: 1 } });
    console.warn("[Case triage] Analysis unavailable; manual processing remains available.");
  }
}
