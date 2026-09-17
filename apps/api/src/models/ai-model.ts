import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const aiModelSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    name: { type: String, required: true },
    version: { type: String, required: true },
    type: { type: String, enum: ["classifier", "sla_predictor", "embedder"], required: true },
    status: { type: String, enum: ["training", "ready", "active", "retired"], default: "training" },
    metrics: {
      accuracy: { type: Number, default: null },
      f1Macro: { type: Number, default: null },
      rocAuc: { type: Number, default: null },
      trainingSamples: { type: Number, default: 0 },
      evaluationSamples: { type: Number, default: 0 }
    },
    config: { type: Schema.Types.Mixed, default: {} },
    artifactPath: { type: String, default: "" },
    trainedBy: { type: String, default: "system" },
    promotedAt: { type: Date, default: null },
    retiredAt: { type: Date, default: null }
  },
  { timestamps: true }
);
aiModelSchema.index({ type: 1, status: 1 });

export const AIModel = models.AIModel || model("AIModel", aiModelSchema);
