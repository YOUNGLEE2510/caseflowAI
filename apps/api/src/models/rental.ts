import mongoose from "mongoose";
const { Schema, models, model } = mongoose;
const propertySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  code: { type: String, required: true }, name: { type: String, required: true },
  address: { type: String, default: "" }, active: { type: Boolean, default: true }
}, { timestamps: true });
propertySchema.index({ organizationId: 1, code: 1 }, { unique: true });
const unitSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  propertyCode: { type: String, required: true }, code: { type: String, required: true },
  floor: { type: String, default: "" }, residentIds: [{ type: Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });
unitSchema.index({ organizationId: 1, propertyCode: 1, code: 1 }, { unique: true });
const assetSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  propertyCode: { type: String, required: true }, unitCode: { type: String, default: "" },
  code: { type: String, required: true }, name: { type: String, required: true },
  category: { type: String, required: true }, active: { type: Boolean, default: true }
}, { timestamps: true });
assetSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const RentalProperty = models.RentalProperty || model("RentalProperty", propertySchema);
export const RentalUnit = models.RentalUnit || model("RentalUnit", unitSchema);
export const RentalAsset = models.RentalAsset || model("RentalAsset", assetSchema);
const maintenanceSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  key: { type: String, required: true }, fingerprint: { type: String, required: true, select: false },
  propertyCode: { type: String, required: true }, assetCode: { type: String, required: true },
  dueAt: { type: Date, required: true }, title: { type: String, required: true },
  assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["planned", "in_progress", "completed", "cancelled"], default: "planned" },
  result: { type: String, default: "" }, completedAt: { type: Date, default: null }
}, { timestamps: true });
maintenanceSchema.index({ organizationId: 1, key: 1 }, { unique: true });
maintenanceSchema.index({ organizationId: 1, assetCode: 1, createdAt: -1 });
export const MaintenanceTask = models.MaintenanceTask || model("MaintenanceTask", maintenanceSchema);
