import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const passwordResetTokenSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
passwordResetTokenSchema.index({ organizationId: 1, userId: 1, usedAt: 1 });

export const PasswordResetToken = models.PasswordResetToken || model("PasswordResetToken", passwordResetTokenSchema);
