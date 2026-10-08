import type { Request } from "express";
import { config } from "../config.js";
import { AuditLog, Notification } from "../models.js";
import type { UserRole } from "../models.js";

/* ── Audit Log Helper ── */

interface AuditEntry {
  organizationId: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry, req?: Request) {
  try {
    await AuditLog.create({
      ...entry,
      expiresAt: config.AUDIT_RETENTION_DAYS > 0 ? new Date(Date.now() + config.AUDIT_RETENTION_DAYS * 86400_000) : null,
      ip: req?.ip || "",
      userAgent: req?.headers["user-agent"] || ""
    });
  } catch (error) {
    console.error("Audit log failed:", error);
  }
}

export function auditFromReq(req: Request) {
  return {
    organizationId: req.auth!.organizationId,
    actorId: req.auth!.id,
    actorName: req.auth!.name,
    actorRole: req.auth!.role as UserRole
  };
}

/* ── Notification Helper ── */

interface NotifyParams {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message?: string;
  relatedCaseId?: string;
  relatedIncidentId?: string;
  actionUrl?: string;
}

export async function notify(params: NotifyParams) {
  try {
    await Notification.create(params);
  } catch (error) {
    console.error("Notification create failed:", error);
  }
}

export async function notifyMany(userIds: string[], base: Omit<NotifyParams, "userId">) {
  if (userIds.length === 0) return;
  try {
    await Notification.insertMany(
      userIds.map((userId) => ({ ...base, userId }))
    );
  } catch (error) {
    console.error("Bulk notification failed:", error);
  }
}
