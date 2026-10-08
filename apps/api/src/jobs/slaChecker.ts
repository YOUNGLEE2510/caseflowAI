import mongoose from "mongoose";
import { CaseRecord, Organization, ServiceDefinition, User } from "../models.js";
import { predictSla } from "../services/aiClient.js";
import { notify, notifyMany } from "../services/helpers.js";
import { acquireJobLease, releaseJobLease } from "../services/jobLease.js";
import { addBusinessHours, businessHoursBetween, organizationCalendar } from "../services/workingHours.js";

const SLA_PREDICTION_CONCURRENCY = 5;

/**
 * SLA Checker Job — runs periodically to:
 * 1. Re-evaluate risk scores for all open cases
 * 2. Mark cases as SLA-breached when due date is passed
 * 3. Send notifications for high-risk cases
 *
 * Uses node-cron (set up in index.ts) — no Redis required.
 */

export async function runSlaCheck() {
  let lease: { ownerId: string } | null = null;
  try {
    lease = await acquireJobLease("sla-checker", 30 * 60_000);
  } catch (error) {
    console.error("[SLA Checker] Could not acquire job lease:", error);
    return;
  }
  if (!lease) {
    console.log("[SLA Checker] Skipped because another API instance owns the lease.");
    return;
  }

  const now = new Date();
  console.log(`[SLA Checker] Running at ${now.toISOString()}`);

  try {
    const openCases = await CaseRecord.find({
      status: { $nin: ["resolved", "closed"] }
    }).lean();
    const organizationIds = [...new Set(openCases.map((item: any) => String(item.organizationId)))];
    const [organizations, services, managers] = await Promise.all([
      Organization.find({ _id: { $in: organizationIds } })
        .select("settings.holidayDates")
        .lean(),
      ServiceDefinition.find({
        organizationId: { $in: organizationIds },
        active: true
      }).select("organizationId key slaHours").lean(),
      User.find({
        organizationId: { $in: organizationIds },
        role: { $in: ["manager", "org_admin"] },
        active: true
      }).select("_id organizationId").lean()
    ]);
    const calendars = new Map(organizations.map((organization: any) => [String(organization._id), organizationCalendar(organization.settings)]));
    const serviceHours = new Map(services.map((service: any) => [`${service.organizationId}:${service.key}`, service.slaHours]));
    const managerIdsByOrganization = new Map<string, string[]>();
    for (const manager of managers) {
      const organizationId = String((manager as any).organizationId);
      const ids = managerIdsByOrganization.get(organizationId) || [];
      ids.push(String((manager as any)._id));
      managerIdsByOrganization.set(organizationId, ids);
    }

    let updated = 0;
    let breached = 0;
    let warned = 0;

    const processRecord = async (record: any) => {
      const caseDoc = record as any;
      const calendar = calendars.get(String(caseDoc.organizationId)) || organizationCalendar();
      const configuredHours = serviceHours.get(`${caseDoc.organizationId}:${caseDoc.serviceKey}`);
      let dueAt = new Date(caseDoc.dueAt);
      const slaStart = new Date(caseDoc.slaStartedAt || caseDoc.createdAt);
      const elapsedHours = businessHoursBetween(slaStart, now, calendar);
      if (typeof configuredHours === "number") {
        const recalculatedDueAt = addBusinessHours(slaStart, configuredHours, calendar);
        if (recalculatedDueAt.getTime() !== dueAt.getTime()) {
          dueAt = recalculatedDueAt;
        }
      }
      const dueHours = businessHoursBetween(slaStart, dueAt, calendar);

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
      if (dueAt.getTime() !== new Date(caseDoc.dueAt).getTime()) changes.dueAt = dueAt;

      // Mark breached if past due
      if (now > dueAt && !caseDoc.slaBreached) {
        changes.slaBreached = true;
        changes.slaBreachedAt = now;
        breached++;
      }

      // Update if risk score changed significantly
      if (Math.abs((caseDoc.ai?.riskScore || 0) - sla.riskScore) > 0.05 || changes.slaBreached || changes.dueAt) {
        await CaseRecord.updateOne({ _id: caseDoc._id }, { $set: changes });
        updated++;

        // Warn assignee/managers for high-risk cases
        if (sla.riskScore >= 0.7 && (caseDoc.ai?.riskScore || 0) < 0.7) {
          const recipients: string[] = [];
          if (caseDoc.assigneeId) recipients.push(String(caseDoc.assigneeId));

          // Managers were loaded once for the whole batch to avoid an N+1 query.
          for (const managerId of managerIdsByOrganization.get(String(caseDoc.organizationId)) || []) {
            if (!recipients.includes(managerId)) {
              recipients.push(managerId);
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
    };

    for (let start = 0; start < openCases.length; start += SLA_PREDICTION_CONCURRENCY) {
      await Promise.all(openCases.slice(start, start + SLA_PREDICTION_CONCURRENCY).map(processRecord));
    }

    console.log(`[SLA Checker] Done: ${openCases.length} cases scanned, ${updated} updated, ${breached} newly breached, ${warned} warnings sent.`);
  } catch (error) {
    console.error("[SLA Checker] Error:", error);
  } finally {
    await releaseJobLease("sla-checker", lease.ownerId).catch((error) => {
      console.error("[SLA Checker] Could not release job lease:", error);
    });
  }
}
