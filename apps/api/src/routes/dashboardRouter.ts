import { Router } from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/auth.js";
import { CASE_STATUSES, CaseRecord, Incident } from "../models.js";
import { presentCase } from "../services/casePolicy.js";
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get("/dashboard", async (req, res) => {
  const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
  const canViewOperations = req.auth!.role !== "requester";
  const scope: any = { organizationId };
  if (req.auth!.role === "requester") scope.requesterId = req.auth!.id;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3_600_000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 3_600_000);

  const openScope = { ...scope, status: { $nin: ["resolved", "closed"] } };
  const riskScope = { ...openScope, $or: [{ "ai.riskScore": { $gte: 0.65 } }, { dueAt: { $lt: now } }] };
  const aggregateScope: Record<string, unknown> = { organizationId };
  if (req.auth!.role === "requester") {
    aggregateScope.requesterId = new mongoose.Types.ObjectId(req.auth!.id);
  }

  const [
    openCount, atRiskCount, resolvedCount, incidentCount,
    resolvedPrev,
    totalCases, statusRows, teamWorkloadRows, recentCases,
    highRiskCases, activeIncidents, resolutionStats
  ] = await Promise.all([
    CaseRecord.countDocuments(openScope),
    CaseRecord.countDocuments(riskScope),
    CaseRecord.countDocuments({ ...scope, status: { $in: ["resolved", "closed"] }, resolvedAt: { $gte: thirtyDaysAgo } }),
    canViewOperations
      ? Incident.countDocuments({ organizationId, status: { $nin: ["resolved"] } })
      : Promise.resolve(0),
    CaseRecord.countDocuments({ ...scope, status: { $in: ["resolved", "closed"] }, resolvedAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    CaseRecord.countDocuments(scope),
    CaseRecord.aggregate([
      { $match: aggregateScope },
      { $group: { _id: "$status", value: { $sum: 1 } } }
    ]),
    canViewOperations
      ? CaseRecord.aggregate([
          { $match: { organizationId, status: { $nin: ["resolved", "closed"] } } },
          {
            $group: {
              _id: "$team",
              open: { $sum: 1 },
              risk: {
                $sum: { $cond: [{ $or: [{ $gte: ["$ai.riskScore", 0.65] }, { $lt: ["$dueAt", now] }] }, 1, 0] }
              }
            }
          },
          { $sort: { open: -1 } }
        ])
      : Promise.resolve([]),
    CaseRecord.find(scope).sort({ updatedAt: -1 }).limit(8).lean(),
    CaseRecord.find(riskScope)
      .sort({ "ai.riskScore": -1, dueAt: 1 })
      .limit(8)
      .lean(),
    canViewOperations
      ? Incident.find({ organizationId, status: { $ne: "resolved" } })
          .sort({ severity: -1, createdAt: -1 })
          .limit(6)
          .lean()
      : Promise.resolve([]),
    CaseRecord.aggregate([
      { $match: { ...aggregateScope, resolvedAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          averageHours: {
            $avg: { $divide: [{ $subtract: ["$resolvedAt", "$createdAt"] }, 3_600_000] }
          }
        }
      }
    ])
  ]);

  function trend(current: number, previous: number) {
    if (previous === 0) return null;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  const statusMap = new Map(statusRows.map((item) => [item._id, item.value]));
  const priorityCases = [...highRiskCases, ...recentCases]
    .filter((item, index, items) => items.findIndex((candidate) => String(candidate._id) === String(item._id)) === index)
    .slice(0, 8);

  res.json({
    metrics: {
      open: openCount,
      openTrend: null,
      openTrendLabel: "so với 7 ngày trước",
      atRisk: atRiskCount,
      atRiskTrend: null,
      atRiskTrendLabel: "so với hôm qua",
      resolved: resolvedCount,
      resolvedTrend: trend(resolvedCount, resolvedPrev),
      resolvedTrendLabel: "trong 30 ngày",
      activeIncidents: incidentCount,
      activeIncidentsTrend: null,
      activeIncidentsTrendLabel: "tại thời điểm truy vấn",
      averageResolutionHours: Number((resolutionStats[0]?.averageHours || 0).toFixed(1))
    },
    statusDistribution: CASE_STATUSES.map((name) => ({ name, value: statusMap.get(name) || 0 })),
    teamWorkload: teamWorkloadRows.map((item) => ({
      team: item._id || "Chưa phân đội",
      open: item.open,
      risk: item.risk
    })),
    recentCases: recentCases.map((item) => presentCase(item, req.auth!.role)),
    highRiskCases: highRiskCases.map((item) => presentCase(item, req.auth!.role)),
    incidents: activeIncidents,
    priorityCases: priorityCases.map((item) => presentCase(item, req.auth!.role)),
    totalCases
  });
});

