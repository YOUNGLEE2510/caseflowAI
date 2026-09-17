import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const serviceSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true },
    team: { type: String, required: true },
    slaHours: { type: Number, required: true, min: 1 },
    escalationHours: { type: Number, default: null },
    autoAssign: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    requiredFields: [{ type: String }],
    formTemplate: { type: Schema.Types.Mixed, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);
serviceSchema.index({ organizationId: 1, key: 1 }, { unique: true });

export const ServiceDefinition = models.ServiceDefinition || model("ServiceDefinition", serviceSchema);
