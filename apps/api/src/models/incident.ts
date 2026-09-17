import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { INCIDENT_STATUSES, SEVERITY_LEVELS } from "./constants.js";

const incidentResponseSchema = new Schema(
  {
    type: { type: String, required: true },
    label: { type: String, required: true },
    actorName: { type: String, default: "Hệ thống" },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const incidentSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    severity: { type: String, enum: SEVERITY_LEVELS, default: "medium" },
    status: { type: String, enum: INCIDENT_STATUSES, default: "monitoring" },
    team: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    ownerName: { type: String, default: "" },
    caseIds: [{ type: Schema.Types.ObjectId, ref: "CaseRecord" }],
    affectedCount: { type: Number, default: 0 },
    signal: {
      clusterScore: { type: Number, default: 0 },
      growthRate: { type: Number, default: 0 },
      keywords: [{ type: String }],
      detectionConfidence: { type: Number, default: 0 }
    },
    responseTimeline: [incidentResponseSchema],
    detectedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    rootCause: { type: String, default: "" },
    resolution: { type: String, default: "" }
  },
  { timestamps: true }
);

export const Incident = models.Incident || model("Incident", incidentSchema);
