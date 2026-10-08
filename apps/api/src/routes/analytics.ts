import { Router } from "express";
import mongoose from "mongoose";
import { requireRoles } from "../middleware/auth.js";
import { HttpError } from "../middleware/error.js";
import { AuditLog, CaseRecord, Incident, Organization, ServiceDefinition, SLASnapshot } from "../models.js";
import { pageNumber } from "../services/casePolicy.js";
import { buildReviewedTrainingCsv, type ReviewedCase } from "../services/trainingDataset.js";
import { addBusinessHours, businessHoursBetween, organizationCalendar } from "../services/workingHours.js";
import { auditFromReq, logAudit } from "../services/helpers.js";

export const analyticsRouter = Router();

function csvCell(value: unknown) {
  let cell = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet applications from evaluating user-controlled values as formulas.
  if (/^[\t\r ]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

/* ═══════════════════════════════════════════════
   TREND: Hồ sơ mới theo ngày (30 ngày gần nhất)
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/trends",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const days = Math.max(7, pageNumber(req.query.days, 30, 90));
    const since = new Date(Date.now() - days * 24 * 3_600_000);

    const [created, resolved] = await Promise.all([
      CaseRecord.aggregate([
        { $match: { organizationId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      CaseRecord.aggregate([
        { $match: { organizationId, resolvedAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$resolvedAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      created: created.map((d) => ({ date: d._id, count: d.count })),
      resolved: resolved.map((d) => ({ date: d._id, count: d.count }))
    });
  }
);

/* ═══════════════════════════════════════════════
   SLA COMPLIANCE: Tỷ lệ đúng hạn theo team/service
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/sla-compliance",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const days = Math.max(7, pageNumber(req.query.days, 30, 90));
    const since = new Date(Date.now() - days * 24 * 3_600_000);

    const [organization, services, resolvedRows] = await Promise.all([
      Organization.findById(req.auth!.organizationId).select("settings.holidayDates").lean(),
      ServiceDefinition.find({ organizationId, active: true }).select("key slaHours").lean(),
      CaseRecord.find({ organizationId, status: { $in: ["resolved", "closed"] }, resolvedAt: { $gte: since } })
        .select("team serviceKey createdAt slaStartedAt dueAt resolvedAt")
        .lean()
    ]);
    const calendar = organizationCalendar((organization as { settings?: { holidayDates?: string[] } } | null)?.settings);
    const slaHoursByService = new Map((services as unknown as Array<{ key: string; slaHours: number }>).map((service) => [service.key, service.slaHours]));
    const grouped = new Map<string, { total: number; breached: number; onTime: number; durationHours: number }>();
    for (const row of resolvedRows as unknown as Array<{ team: string; serviceKey: string; createdAt: Date; slaStartedAt?: Date; dueAt: Date; resolvedAt: Date | null }>) {
      if (!row.resolvedAt) continue;
      const configuredHours = slaHoursByService.get(row.serviceKey);
      const slaStart = new Date(row.slaStartedAt || row.createdAt);
      const dueAt = configuredHours === undefined ? new Date(row.dueAt) : addBusinessHours(slaStart, configuredHours, calendar);
      const item = grouped.get(row.team) || { total: 0, breached: 0, onTime: 0, durationHours: 0 };
      item.total += 1;
      item.durationHours += businessHoursBetween(slaStart, new Date(row.resolvedAt), calendar);
      if (new Date(row.resolvedAt) > dueAt) item.breached += 1;
      else item.onTime += 1;
      grouped.set(row.team, item);
    }
    const resolvedCases = [...grouped.entries()]
      .map(([team, item]) => ({ _id: team, ...item, avgDurationHours: item.total ? item.durationHours / item.total : 0 }))
      .sort((a, b) => b.total - a.total);

    const overall = resolvedCases.reduce(
      (acc, t) => ({
        total: acc.total + t.total,
        onTime: acc.onTime + t.onTime,
        breached: acc.breached + t.breached
      }),
      { total: 0, onTime: 0, breached: 0 }
    );

    res.json({
      overall: {
        ...overall,
        complianceRate: overall.total ? Number(((overall.onTime / overall.total) * 100).toFixed(1)) : null
      },
      byTeam: resolvedCases.map((t) => ({
        team: t._id,
        total: t.total,
        onTime: t.onTime,
        breached: t.breached,
        complianceRate: Number(((t.onTime / t.total) * 100).toFixed(1)),
        avgDurationHours: Number(t.avgDurationHours.toFixed(1))
      }))
    });
  }
);

/* ═══════════════════════════════════════════════
   TEAM PERFORMANCE: Hiệu suất nhân viên
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/team-performance",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const days = Math.max(7, pageNumber(req.query.days, 30, 90));
    const since = new Date(Date.now() - days * 24 * 3_600_000);

    const performance = await CaseRecord.aggregate([
      {
        $match: {
          organizationId,
          assigneeId: { $ne: null },
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: { id: "$assigneeId", name: "$assigneeName", team: "$team" },
          assigned: { $sum: 1 },
          resolved: {
            $sum: { $cond: [{ $in: ["$status", ["resolved", "closed"]] }, 1, 0] }
          },
          open: {
            $sum: { $cond: [{ $not: [{ $in: ["$status", ["resolved", "closed"]] }] }, 1, 0] }
          },
          avgRisk: { $avg: "$ai.riskScore" },
          breached: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ["$status", ["resolved", "closed"]] },
                    { $gt: ["$resolvedAt", "$dueAt"] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { resolved: -1 } }
    ]);

    res.json({
      agents: performance.map((p) => ({
        id: String(p._id.id),
        name: p._id.name,
        team: p._id.team,
        assigned: p.assigned,
        resolved: p.resolved,
        open: p.open,
        breached: p.breached,
        avgRisk: Number((p.avgRisk || 0).toFixed(2)),
        resolutionRate: p.assigned ? Number(((p.resolved / p.assigned) * 100).toFixed(1)) : 0
      }))
    });
  }
);

/* ═══════════════════════════════════════════════
   CSAT: Điểm hài lòng do requester gửi sau xử lý
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/csat",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const days = Math.max(7, pageNumber(req.query.days, 30, 365));
    const since = new Date(Date.now() - days * 24 * 3_600_000);
    const [summary] = await CaseRecord.aggregate([
      { $match: { organizationId, status: { $in: ["resolved", "closed"] }, resolvedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          eligible: { $sum: 1 },
          responses: { $sum: { $cond: [{ $ne: ["$satisfaction", null] }, 1, 0] } },
          average: { $avg: "$satisfaction" },
          ratings: { $push: "$satisfaction" }
        }
      }
    ]);
    const distribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: (summary?.ratings || []).filter((value: number | null) => value === rating).length
    }));
    const responses = summary?.responses || 0;
    res.json({
      eligible: summary?.eligible || 0,
      responses,
      responseRate: summary?.eligible ? Number(((responses / summary.eligible) * 100).toFixed(1)) : null,
      averageScore: responses ? Number((summary.average || 0).toFixed(2)) : null,
      distribution
    });
  }
);

/* ═══════════════════════════════════════════════
   AI ACCURACY: Độ chính xác phân loại AI
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/ai-accuracy",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);

    const [total, corrected, confirmed, byCategory, confidenceDistribution] = await Promise.all([
      CaseRecord.countDocuments({ organizationId, "ai.classification": { $ne: "" } }),
      CaseRecord.countDocuments({ organizationId, "ai.reviewStatus": "corrected" }),
      CaseRecord.countDocuments({ organizationId, "ai.reviewStatus": "confirmed" }),
      CaseRecord.aggregate([
        { $match: { organizationId, "ai.classification": { $ne: "" } } },
        {
          $group: {
            _id: "$ai.classification",
            count: { $sum: 1 },
            avgConfidence: { $avg: "$ai.confidence" },
            corrected: { $sum: { $cond: [{ $eq: ["$ai.reviewStatus", "corrected"] }, 1, 0] } },
            confirmed: { $sum: { $cond: [{ $eq: ["$ai.reviewStatus", "confirmed"] }, 1, 0] } }
          }
        },
        { $sort: { count: -1 } }
      ]),
      CaseRecord.aggregate([
        { $match: { organizationId, "ai.confidence": { $gt: 0 } } },
        {
          $bucket: {
            groupBy: "$ai.confidence",
            boundaries: [0, 0.5, 0.7, 0.85, 1.01],
            default: "other",
            output: { count: { $sum: 1 } }
          }
        }
      ])
    ]);

    res.json({
      total,
      corrected,
      confirmed,
      reviewed: corrected + confirmed,
      pending: total - corrected - confirmed,
      confirmationRate: corrected + confirmed ? Number((confirmed / (corrected + confirmed) * 100).toFixed(1)) : null,
      reviewCoverage: total ? Number(((corrected + confirmed) / total * 100).toFixed(1)) : null,
      byCategory: byCategory.map((c) => ({
        category: c._id,
        count: c.count,
        avgConfidence: Number((c.avgConfidence || 0).toFixed(2)),
        corrected: c.corrected,
        confirmed: c.confirmed,
        confirmationRate: c.confirmed + c.corrected ? Number((c.confirmed / (c.confirmed + c.corrected) * 100).toFixed(1)) : null
      })),
      confidenceDistribution
    });
  }
);

/* ═══════════════════════════════════════════════
   CATEGORY DISTRIBUTION: Phân bổ theo danh mục
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/categories",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const days = Math.max(7, pageNumber(req.query.days, 30, 90));
    const since = new Date(Date.now() - days * 24 * 3_600_000);

    const distribution = await CaseRecord.aggregate([
      { $match: { organizationId, createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          avgRisk: { $avg: "$ai.riskScore" },
          avgConfidence: { $avg: "$ai.confidence" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      categories: distribution.map((c) => ({
        category: c._id,
        count: c.count,
        avgRisk: Number((c.avgRisk || 0).toFixed(2)),
        avgConfidence: Number((c.avgConfidence || 0).toFixed(2))
      }))
    });
  }
);

/* ═══════════════════════════════════════════════
   AUDIT LOG: Nhật ký hệ thống
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/audit-log",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const filter: Record<string, unknown> = { organizationId: req.auth!.organizationId };
    if (typeof req.query.action === "string") filter.action = req.query.action;
    if (typeof req.query.resource === "string") filter.resource = req.query.resource;
    if (typeof req.query.actorId === "string") {
      if (!mongoose.isValidObjectId(req.query.actorId)) throw new HttpError(400, "Mã người dùng không hợp lệ.");
      filter.actorId = new mongoose.Types.ObjectId(req.query.actorId);
    }

    const page = pageNumber(req.query.page, 1, 100000);
    const limit = pageNumber(req.query.limit, 25, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .select("actorName actorRole action resource resourceId changes createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
  }
);

/* ═══════════════════════════════════════════════
   CSV EXPORT: Xuất dữ liệu hồ sơ
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/export/csv",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const cases = await CaseRecord.find({ organizationId: req.auth!.organizationId })
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      "Mã hồ sơ", "Tiêu đề", "Trạng thái", "Ưu tiên", "Dịch vụ",
      "Đội xử lý", "Người yêu cầu", "Người xử lý", "Phân loại AI",
      "Độ tin cậy AI", "Rủi ro SLA", "Kênh", "Ngày tạo", "Ngày giải quyết"
    ];
    const rows = cases.map((c: any) => [
      c.code,
      c.title,
      c.status,
      c.priority,
      c.serviceKey,
      c.team,
      c.requesterName,
      c.assigneeName || "",
      c.ai?.classification || "",
      c.ai?.confidence || 0,
      c.ai?.riskScore || 0,
      c.channel || "",
      c.createdAt?.toISOString?.() || "",
      c.resolvedAt?.toISOString?.() || ""
    ]);

    const csv = [headers.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
    const bom = "\uFEFF";
    await logAudit({ ...auditFromReq(req), action: "case.export", resource: "CaseRecord", changes: { rows: cases.length, format: "csv" } }, req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="caseflow-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(bom + csv);
  }
);

/* ═══════════════════════════════════════════════
   TRAINING DATA EXPORT: Only human-reviewed, de-identified cases
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/export/training.csv",
  requireRoles("org_admin", "platform_admin"),
  async (req, res) => {
    const cases = await CaseRecord.find({
      organizationId: req.auth!.organizationId,
      "ai.reviewStatus": { $in: ["confirmed", "corrected"] }
    })
      .select("title description category createdAt ai.classification ai.confidence ai.reviewStatus ai.humanCorrectedLabel ai.reviewedAt")
      .sort({ "ai.reviewedAt": -1 })
      .lean();

    const csv = buildReviewedTrainingCsv(cases as unknown as ReviewedCase[]);
    await logAudit({ ...auditFromReq(req), action: "ai.training_export", resource: "CaseRecord", changes: { rows: cases.length, format: "csv", humanReviewedOnly: true } }, req);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="caseflow-reviewed-training-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
);

/* ═══════════════════════════════════════════════
   PRIORITY DISTRIBUTION: Phân bổ theo mức ưu tiên
   ═══════════════════════════════════════════════ */

analyticsRouter.get(
  "/priorities",
  requireRoles("manager", "org_admin", "platform_admin"),
  async (req, res) => {
    const organizationId = new mongoose.Types.ObjectId(req.auth!.organizationId);
    const rows = await CaseRecord.aggregate([
      { $match: { organizationId, status: { $nin: ["resolved", "closed"] } } },
      { $group: { _id: "$priority", count: { $sum: 1 } } }
    ]);
    res.json({
      priorities: ["low", "normal", "high", "urgent"].map((p) => ({
        name: p,
        count: rows.find((r) => r._id === p)?.count || 0
      }))
    });
  }
);
