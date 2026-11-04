// Embed the conversation with the case; optimistic concurrency rejects conflicting saves.
import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { CASE_STATUSES, PRIORITIES, CHANNELS } from "./constants.js";
import { caseSearchTokens } from "../services/caseSearch.js";

const timelineEventSchema = new Schema(
  {
    type: { type: String, required: true },
    label: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String, default: "Hệ thống" },
    metadata: { type: Schema.Types.Mixed, default: {} },
    internal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);
const commentSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true },
    body: { type: String, required: true, trim: true },
    internal: { type: Boolean, default: false },
    attachmentIds: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);
const caseSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    code: { type: String, required: true, unique: true },
    idempotencyKeyHash: { type: String },
    requestFingerprint: { type: String },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    serviceKey: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    priority: { type: String, enum: PRIORITIES, default: "normal", index: true },
    status: { type: String, enum: CASE_STATUSES, default: "new", index: true },
    channel: { type: String, enum: CHANNELS, default: "portal" },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterName: { type: String, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
    searchTokens: { type: [String], select: false },
    searchVersion: { type: Number, select: false },
    mergedIntoId: { type: Schema.Types.ObjectId, ref: "CaseRecord", default: null },
    mergedAt: { type: Date, default: null },
    mergedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assigneeName: { type: String, default: "" },
    team: { type: String, required: true, index: true },
    dueAt: { type: Date, required: true, index: true },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    slaBreached: { type: Boolean, default: false },
    slaBreachedAt: { type: Date, default: null },
    slaStartedAt: { type: Date, default: null },
    slaPausedAt: { type: Date, default: null },
    slaPausedHours: { type: Number, default: 0 },
    attachmentCount: { type: Number, default: 0 },
    attachmentBytes: { type: Number, default: 0 },
    attachmentReservations: { type: [{
      filename: String, size: Number, storageProvider: { type: String, enum: ["local", "s3", "cloudinary"] }, expiresAt: Date
    }], default: [], select: false },
    transferCount: { type: Number, default: 0 },
    reopenCount: { type: Number, default: 0 },
    cycles: [{
      cycleNumber: Number, startedAt: Date, resolvedAt: Date, closedAt: Date, dueAt: Date,
      team: String, serviceKey: String, slaPausedHours: Number, breached: Boolean,
      satisfaction: Number, satisfactionComment: String, satisfactionAt: Date
    }],
    deliveryEvents: [{
      kind: String, actorId: { type: Schema.Types.ObjectId, ref: "User" }, actorName: String,
      internal: Boolean, requesterId: { type: Schema.Types.ObjectId, ref: "User" },
      assigneeId: { type: Schema.Types.ObjectId, ref: "User" }, team: String, status: String,
      createdAt: { type: Date, default: Date.now }, completedAt: { type: Date, default: null },
      lockedUntil: { type: Date, default: null }, attempts: { type: Number, default: 0 }
    }],
    satisfaction: { type: Number, default: null, min: 1, max: 5 },
    satisfactionComment: { type: String, default: "", maxlength: 1000 },
    satisfactionAt: { type: Date, default: null },
    customFields: { type: Map, of: String, default: {} },
    tags: [{ type: String }],
    ai: {
      processingStatus: { type: String, enum: ["queued", "running", "complete", "failed", "cancelled"], default: "complete" },
      processingStartedAt: { type: Date, default: null },
      classification: { type: String, default: "" },
      routingMismatch: { type: Boolean, default: false },
      confidence: { type: Number, default: 0 },
      summary: { type: String, default: "" },
      extracted: { type: Map, of: String, default: {} },
      riskScore: { type: Number, default: 0 },
      riskFactors: [{ type: String }],
      suggestedResponse: { type: String, default: "" },
      similarCaseIds: [{ type: Schema.Types.ObjectId, ref: "CaseRecord" }],
      modelVersion: { type: String, default: "baseline-v1" },
      analyzedAt: { type: Date, default: Date.now },
      reviewStatus: {
        type: String,
        enum: ["pending", "confirmed", "corrected"],
        default: "pending"
      },
      reviewedAt: { type: Date, default: null },
      reviewedById: { type: Schema.Types.ObjectId, ref: "User", default: null },
      reviewedByName: { type: String, default: "" },
      humanCorrectedLabel: { type: String, default: null }
    },
    events: { type: [timelineEventSchema], validate: { validator: (events: unknown[]) => events.length <= 5000, message: "Hồ sơ đã đạt giới hạn lịch sử xử lý." } },
    comments: { type: [commentSchema], validate: { validator: (comments: unknown[]) => comments.length <= 500, message: "Hồ sơ đã đạt giới hạn trao đổi." } }
  },
  { timestamps: true, optimisticConcurrency: true }
);
caseSchema.index({ organizationId: 1, createdAt: -1 });
  caseSchema.index({ "attachmentReservations.expiresAt": 1 }, { sparse: true });
caseSchema.index({ "deliveryEvents.completedAt": 1, "deliveryEvents.lockedUntil": 1 });
caseSchema.index({ "ai.processingStatus": 1, "ai.processingStartedAt": 1 });
caseSchema.pre("save", function () {
  if (!this.isNew && !this.isModified("events")) return;
  const event = this.events.at(-1);
  if (!event) return;
  this.deliveryEvents.push({ _id: event._id, kind: this.isNew ? "created" : event.type,
    actorId: event.actorId || this.createdById, actorName: event.actorName, internal: event.internal,
    requesterId: this.requesterId, assigneeId: this.assigneeId, team: this.team, status: this.status });
});
caseSchema.index({ organizationId: 1, searchTokens: 1 }, { name: "case_search_prefix_org" });
caseSchema.index({ searchVersion: 1 }, { name: "case_search_version" });
caseSchema.index({ organizationId: 1, mergedIntoId: 1 });
caseSchema.pre("validate", function () {
  if (this.isNew || this.isModified("code") || this.isModified("title") || this.isModified("requesterName")) {
    this.searchTokens = caseSearchTokens(this);
    this.searchVersion = 1;
  }
});
caseSchema.pre("insertMany", function (next, docs: Array<{ code?: string; title?: string; requesterName?: string; searchTokens?: string[]; searchVersion?: number }>) {
  for (const doc of docs) { doc.searchTokens = caseSearchTokens(doc); doc.searchVersion = 1; }
  next();
});
caseSchema.index({ organizationId: 1, requesterId: 1, idempotencyKeyHash: 1 }, {
  unique: true,
  partialFilterExpression: { idempotencyKeyHash: { $type: "string" } }
});
caseSchema.index({ organizationId: 1, status: 1, dueAt: 1 });
caseSchema.index({ organizationId: 1, "ai.riskScore": -1 });
caseSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
caseSchema.index({ code: "text", title: "text", description: "text" });

export const CaseRecord = models.CaseRecord || model("CaseRecord", caseSchema);
