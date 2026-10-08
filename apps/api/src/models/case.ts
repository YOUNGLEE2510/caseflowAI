/**
 * CaseRecord — trung tâm của toàn bộ domain model.
 *
 * Timeline events và comments được embed (không tách collection riêng) vì:
 * - Luôn đọc cùng case → tránh N+1 query
 * - Không cần query timeline across cases (nếu cần thì dùng aggregation)
 * - Mongoose subdocument giữ được _id riêng cho mỗi entry
 *
 * optimisticConcurrency: true → Mongoose tự tăng __v và kiểm tra khi save,
 * tránh 2 agent cùng cập nhật 1 case ghi đè lẫn nhau.
 */
import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { CASE_STATUSES, PRIORITIES, CHANNELS } from "./constants.js";

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
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    serviceKey: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    priority: { type: String, enum: PRIORITIES, default: "normal", index: true },
    status: { type: String, enum: CASE_STATUSES, default: "new", index: true },
    channel: { type: String, enum: CHANNELS, default: "portal" },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterName: { type: String, required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assigneeName: { type: String, default: "" },
    team: { type: String, required: true, index: true },
    dueAt: { type: Date, required: true, index: true },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    slaBreached: { type: Boolean, default: false },
    slaBreachedAt: { type: Date, default: null },
    slaStartedAt: { type: Date, default: null },
    transferCount: { type: Number, default: 0 },
    reopenCount: { type: Number, default: 0 },
    satisfaction: { type: Number, default: null, min: 1, max: 5 },
    satisfactionComment: { type: String, default: "", maxlength: 1000 },
    satisfactionAt: { type: Date, default: null },
    customFields: { type: Map, of: String, default: {} },
    tags: [{ type: String }],
    ai: {
      classification: { type: String, default: "" },
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
    events: [timelineEventSchema],
    comments: [commentSchema]
  },
  { timestamps: true, optimisticConcurrency: true }
);
caseSchema.index({ organizationId: 1, createdAt: -1 });
caseSchema.index({ organizationId: 1, status: 1, dueAt: 1 });
caseSchema.index({ organizationId: 1, "ai.riskScore": -1 });
caseSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
caseSchema.index({ code: "text", title: "text", description: "text" });

export const CaseRecord = models.CaseRecord || model("CaseRecord", caseSchema);
