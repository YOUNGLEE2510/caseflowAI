import mongoose from "mongoose";
const { Schema, models, model } = mongoose;
/** vacant: no tenant · reserved: deposit taken · occupied: tenant living there · notice: tenant moving out soon */
export const UNIT_OCCUPANCY = ["vacant", "reserved", "occupied", "notice"] as const;
/** needs_cleaning → cleaned → ready; under_repair blocks renting until fixed */
export const UNIT_READINESS = ["needs_cleaning", "cleaned", "under_repair", "ready"] as const;
const propertySchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  code: { type: String, required: true }, name: { type: String, required: true },
  address: { type: String, default: "" }, active: { type: Boolean, default: true }
}, { timestamps: true });
propertySchema.index({ organizationId: 1, code: 1 }, { unique: true });
const unitSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  propertyCode: { type: String, required: true }, code: { type: String, required: true },
  floor: { type: String, default: "" }, residentIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  // QR intake link. The version only ever increases, so re-issuing invalidates every printed code.
  qrEnabled: { type: Boolean, default: false }, qrVersion: { type: Number, default: 0, min: 0 }, qrIssuedAt: { type: Date, default: null },
  // Two independent axes: who holds the unit, and whether it is physically ready.
  occupancyStatus: { type: String, enum: UNIT_OCCUPANCY, default: "vacant" },
  readinessStatus: { type: String, enum: UNIT_READINESS, default: "ready" },
  availableFrom: { type: Date, default: null },
  statusNote: { type: String, default: "", maxlength: 300 },
  statusUpdatedAt: { type: Date, default: null },
  statusUpdatedByName: { type: String, default: "" },
  statusHistory: { type: [{
    axis: { type: String, enum: ["occupancy", "readiness"], required: true },
    from: { type: String, default: "" }, to: { type: String, required: true },
    note: { type: String, default: "", maxlength: 300 }, actorName: { type: String, default: "" }, at: { type: Date, default: Date.now }
  }], default: [], select: false }
}, { timestamps: true });
unitSchema.index({ organizationId: 1, propertyCode: 1, occupancyStatus: 1, readinessStatus: 1 });
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
