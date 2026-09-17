import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const notificationSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["case_assigned", "case_updated", "case_commented", "sla_warning", "sla_breached", "incident_detected", "system"],
      required: true
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    relatedCaseId: { type: Schema.Types.ObjectId, ref: "CaseRecord", default: null },
    relatedIncidentId: { type: Schema.Types.ObjectId, ref: "Incident", default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    actionUrl: { type: String, default: "" }
  },
  { timestamps: true }
);
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const Notification = models.Notification || model("Notification", notificationSchema);
