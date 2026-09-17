import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { USER_ROLES } from "./constants.js";

const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, enum: USER_ROLES, required: true },
    action: {
      type: String,
      enum: [
        "case.create", "case.update", "case.triage", "case.assign", "case.comment", "case.resolve", "case.close", "case.reopen",
        "service.create", "service.update", "service.delete",
        "user.create", "user.update", "user.deactivate",
        "knowledge.create", "knowledge.update", "knowledge.delete",
        "incident.create", "incident.update", "incident.resolve",
        "auth.login", "auth.logout",
        "ai.classify", "ai.retrain"
      ],
      required: true
    },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId, default: null },
    changes: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, actorId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, resource: 1, resourceId: 1 });

export const AuditLog = models.AuditLog || model("AuditLog", auditLogSchema);
