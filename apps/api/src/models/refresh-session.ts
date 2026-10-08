import mongoose from "mongoose";
const { Schema, model, models } = mongoose;

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, required: true },
  tokenHash: { type: String, required: true, unique: true },
  familyId: { type: String, required: true, index: true },
  tokenVersion: { type: Number, required: true },
  remember: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSession = models.RefreshSession || model("RefreshSession", schema);
