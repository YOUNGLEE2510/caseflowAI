import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { USER_ROLES } from "./constants.js";

const userSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    googleSubject: { type: String, select: false },
    microsoftObjectId: { type: String, select: false },
    microsoftTenantId: { type: String, select: false },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, required: true },
    personnelManager: { type: Boolean, default: false },
    team: { type: String, default: "" },
    title: { type: String, default: "" },
    avatarColor: { type: String, default: "#155c4d" },
    phone: { type: String, default: "" },
    skills: [{ type: String }],
    maxCaseload: { type: Number, default: 15 },
    employeeCode: { type: String, default: "" },
    employmentStatus: { type: String, enum: ["working", "on_leave", "inactive"], default: "working" },
    joinedAt: { type: Date, default: null },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    workStart: { type: String, default: "08:00" },
    workEnd: { type: String, default: "17:00" },
    leaveRequests: [{
      start: { type: String, required: true }, end: { type: String, required: true },
      reason: { type: String, required: true, maxlength: 500 },
      status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
      createdAt: { type: Date, default: Date.now }, reviewedAt: Date, cancelledAt: Date,
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" }, reviewNote: { type: String, maxlength: 500 }
    }],
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    mustChangePassword: { type: Boolean, default: false },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    mfaPendingSecret: { type: String, select: false },
    mfaPendingUntil: { type: Date, select: false },
    mfaLastStep: { type: Number, default: -1, select: false },
    mfaRecoveryHashes: { type: [String], select: false }
  },
  { timestamps: true }
);
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });
userSchema.index(
  { organizationId: 1, googleSubject: 1 },
  { unique: true, partialFilterExpression: { googleSubject: { $type: "string" } } }
);
userSchema.index({ organizationId: 1, role: 1, team: 1, active: 1 });
userSchema.index({ organizationId: 1, microsoftTenantId: 1, microsoftObjectId: 1 }, {
  unique: true,
  partialFilterExpression: { microsoftTenantId: { $type: "string" }, microsoftObjectId: { $type: "string" } }
});

export const User = models.User || model("User", userSchema);
