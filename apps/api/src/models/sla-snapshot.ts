import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import { PRIORITIES } from "./constants.js";

const slaSnapshotSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    caseId: { type: Schema.Types.ObjectId, ref: "CaseRecord", required: true },
    code: { type: String, required: true },
    serviceKey: { type: String, required: true },
    team: { type: String, required: true },
    priority: { type: String, enum: PRIORITIES, required: true },
    slaHours: { type: Number, required: true },
    actualHours: { type: Number, default: null },
    breached: { type: Boolean, default: false },
    resolvedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);
slaSnapshotSchema.index({ organizationId: 1, createdAt: -1 });
slaSnapshotSchema.index({ organizationId: 1, team: 1, breached: 1 });

export const SLASnapshot = models.SLASnapshot || model("SLASnapshot", slaSnapshotSchema);
