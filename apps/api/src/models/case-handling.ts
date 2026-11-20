import mongoose from "mongoose";
const { Schema, models, model } = mongoose;

const schema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  caseId: { type: Schema.Types.ObjectId, ref: "CaseRecord", required: true },
  firstOpenedAt: { type: Date, default: null },
  firstOpenedAiHidden: { type: Boolean, default: null },
  confirmedAt: { type: Date, default: null },
  confirmedAiHidden: { type: Boolean, default: null },
  finalCategory: { type: String, default: null },
  finalPriority: { type: String, default: null }
}, { timestamps: true });
schema.index({ organizationId: 1, userId: 1, caseId: 1 }, { unique: true });
schema.index({ organizationId: 1, confirmedAt: 1 });
export const CaseHandlingRecord = models.CaseHandlingRecord || model("CaseHandlingRecord", schema);
