import mongoose from "mongoose";
import { CaseRecord, User } from "../models.js";
import { predictSla } from "../services/aiClient.js";
import { notify, notifyMany } from "../services/helpers.js";

/**
 * SLA Checker Job — runs periodically to:
 * 1. Re-evaluate risk scores for all open cases
 * 2. Mark cases as SLA-breached when due date is passed
 * 3. Send notifications for high-risk cases
 *
 * Uses node-cron (set up in index.ts) — no Redis required.
 */

export async function runSlaCheck() {
  const now = new Date();
  console.log(`[SLA Checker] Running at ${now.toISOString()}`);

  try {
    const openCases = await CaseRecord.find({
      status: { $nin: ["resolved", "closed"] }
    }).lean();

    let updated = 0;
    let breached = 0;
    let warned = 0;

    for (const record of openCases) {
      const caseDoc = record as any;
      const elapsedHours = (now.getTime() - new Date(caseDoc.createdAt).getTime()) / 3_600_000;
      const dueAt = new Date(caseDoc.dueAt);
      const dueHours = (dueAt.getTime() - new Date(caseDoc.createdAt).getTime()) / 3_600_000;

      // Re-predict SLA risk
      const sla = await predictSla({
        elapsedHours,
        dueHours,
        transfers: caseDoc.transferCount || 0,
        workload: 0, // simplified for batch job
        remainingSteps: caseDoc.status === "in_progress" ? 2 : 3,
        priority: caseDoc.priority
      });

      const changes: any = {
        "ai.riskScore": sla.riskScore,
        "ai.riskFactors": sla.factors
      };

      // Mark breached if past due
      if (now > dueAt && !caseDoc.slaBreached) {
        changes.slaBreached = true;
        changes.slaBreachedAt = now;
        breached++;
      }

      // Update if risk score changed significantly
      if (Math.abs((caseDoc.ai?.riskScore || 0) - sla.riskScore) > 0.05) {
        await CaseRecord.updateOne({ _id: caseDoc._id }, { $set: changes });
        updated++;

        // Warn assignee/managers for high-risk cases
        if (sla.riskScore >= 0.7 && (caseDoc.ai?.riskScore || 0) < 0.7) {
          const recipients: string[] = [];
          if (caseDoc.assigneeId) recipients.push(String(caseDoc.assigneeId));

          // Also notify managers
          const managers = await User.find({
            organizationId: caseDoc.organizationId,
            role: { $in: ["manager", "org_admin"] },
            active: true
          }).select("_id").lean();
          for (const m of managers) {
            if (!recipients.includes(String(m._id))) {
              recipients.push(String(m._id));
            }
          }

          if (recipients.length > 0) {
            await notifyMany(recipients, {
              organizationId: String(caseDoc.organizationId),
              type: "sla_warning",
              title: `⚠ ${caseDoc.code} có nguy cơ trễ SLA`,
              message: `Rủi ro ${Math.round(sla.riskScore * 100)}% — ${sla.factors[0] || "Cần xử lý sớm"}`,
              relatedCaseId: String(caseDoc._id),
              actionUrl: `/cases/${caseDoc._id}`
            });
            warned++;
          }
        }
      }
    }

    console.log(`[SLA Checker] Done: ${openCases.length} cases scanned, ${updated} updated, ${breached} newly breached, ${warned} warnings sent.`);
  } catch (error) {
    console.error("[SLA Checker] Error:", error);
  }
}
