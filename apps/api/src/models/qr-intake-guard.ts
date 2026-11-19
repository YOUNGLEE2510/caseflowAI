import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

/**
 * Atomic guards for unauthenticated QR intake. A unique `key` makes concurrent
 * submissions race on the database instead of on a read-then-write check:
 * - "dup:<hash>"   claims one report text per unit and phone for 30 minutes
 * - "quota:<hash>" counts reports per phone per local day
 * Documents expire on their own.
 */
const qrIntakeGuardSchema = new Schema({
  key: { type: String, required: true, unique: true },
  caseCode: { type: String, default: "" },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: false, versionKey: false });

qrIntakeGuardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const QrIntakeGuard = models.QrIntakeGuard || model("QrIntakeGuard", qrIntakeGuardSchema);
