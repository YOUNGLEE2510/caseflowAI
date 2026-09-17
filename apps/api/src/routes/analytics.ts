import { Router } from "express";
import mongoose from "mongoose";
import { requireRoles } from "../middleware/auth.js";
import { AuditLog, CaseRecord, Incident, SLASnapshot } from "../models.js";
import { pageNumber } from "../services/casePolicy.js";

export const analyticsRouter = Router();

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

    const resolvedCases = await CaseRecord.aggregate([
      {
        $match: {
          organizationId,
          status: { $in: ["resolved", "closed"] },
          resolvedAt: { $gte: since }
        }
      },
      {
        $project: {
          team: 1,
          serviceKey: 1,
          breached: { $gt: ["$resolvedAt", "$dueAt"] },
          durationHours: {
            $divide: [{ $subtract: ["$resolvedAt", "$createdAt"] }, 3_600_000]
          }
        }
      },
      {
        $group: {
          _id: "$team",
          total: { $sum: 1 },
          breached: { $sum: { $cond: ["$breached", 1, 0] } },
          onTime: { $sum: { $cond: ["$breached", 0, 1] } },
          avgDurationHours: { $avg: "$durationHours" }
        }
      },
      { $sort: { total: -1 } }
    ]);

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
    if (typeof req.query.actorId === "string") filter.actorId = req.query.actorId;

    const page = pageNumber(req.query.page, 1, 100000);
    const limit = pageNumber(req.query.limit, 25, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
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
      `"${(c.title || "").replace(/"/g, '""')}"`,
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

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const bom = "\uFEFF";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="caseflow-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(bom + csv);
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

